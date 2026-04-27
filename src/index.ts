/*
 * Copyright 2021 SpinalCom - www.spinalcom.com
 *
 * This file is part of SpinalCore.
 *
 * Please read all of the following terms and conditions
 * of the Free Software license Agreement ("Agreement")
 * carefully.
 *
 * This Agreement is a legally binding contract between
 * the Licensee (as defined below) and SpinalCom that
 * sets forth the terms and conditions that govern your
 * use of the Program. By installing and/or using the
 * Program, you agree to abide by all the terms and
 * conditions stated or referenced herein.
 *
 * If you do not agree to abide by these terms and
 * conditions, do not demonstrate your acceptance and do
 * not install or use the Program.
 * You should have received a copy of the license along
 * with this file. If not, see
 * <http://resources.spinalcom.com/licenses.pdf>.
 */

import {
  spinalCore,
  FileSystem,
  Model,
} from 'spinal-core-connectorjs';
import {
  SpinalGraphService,
  SpinalNode
} from 'spinal-env-viewer-graph-service';

import { CronJob } from 'cron';
import { SpinalMailer } from 'spinal-service-mailer';
import { SpinalExcelFiller } from "spinal-service-excel-filler";
import * as path from "path";
import { existsSync, unlinkSync } from "fs";
import { SpinalDateValue, SpinalServiceTimeseries, TimeSeriesIntervalDate } from 'spinal-model-timeseries';
import { buildFloorZoneMap, generateTempReport } from './temperatureReport';
import { generateWeeklyTicketReport } from './ticketReport';
import { PROCESS_NAME_TO_TOKEN, STEP_NAME_TO_STATUS, TicketCountMap } from './utils';

require('dotenv').config();


export class SpinalMain {

  hubConnection: FileSystem | null = null;
  serviceTimeseries: SpinalServiceTimeseries | null = null;
  buildingEndpoints: SpinalNode[] = [];
  outsideTempEndpoint: SpinalNode | null = null;
  hygrometryEndpoint: SpinalNode | null = null;
  ticketMap: any = {};

  constructor() { }

  public init() {
    if (!process.env.DIGITALTWIN_PATH) {
      throw new Error('DIGITALTWIN_PATH is not defined in environment variables.');
    }

    console.log('Init connection to HUB...');
    const host = process.env.SPINALHUB_PORT
      ? `${process.env.SPINALHUB_IP}:${process.env.SPINALHUB_PORT}`
      : process.env.SPINALHUB_IP;
    const url = `${process.env.SPINALHUB_PROTOCOL}://${process.env.USER_ID}:${process.env.USER_PASSWORD}@${host}/`;
    console.log('Connecting to', url);
    const conn = spinalCore.connect(url);
    this.hubConnection = conn;
    this.serviceTimeseries = new SpinalServiceTimeseries();
    return new Promise((resolve, reject) => {
      spinalCore.load(
        conn,
        process.env.DIGITALTWIN_PATH!,
        async (graph: any) => {
          await SpinalGraphService.setGraph(graph);
          console.log('Connected to Hub.');
          resolve(graph);
        },
        () => {
          console.log('Connection failed! Please check your config file and the state of the hub.');
          reject();
        }
      );
    });
  }


  async load<T extends Model>(server_id: number): Promise<T> {
    if (!server_id) {
      return Promise.reject('Invalid serverId');
    }
    if (typeof FileSystem._objects[server_id] !== 'undefined') {
      // @ts-ignore
      return Promise.resolve(FileSystem._objects[server_id]);
    }
    try {
      if (!this.hubConnection) {
        throw new Error('Hub connection is not initialized.');
      }
      return await this.hubConnection.load_ptr(server_id);
    } catch (error) {
      throw new Error(`Error loading model with server_id: ${server_id}`);
    }
  }

  async getEndpointCurrentValue(endpoint: SpinalNode<any>): Promise<any> {
    const element = await endpoint.element!.load();
    return element.currentValue.get();
  }

  async getEndpointTimeseries(endpoint: SpinalNode<any>, intervalDate: TimeSeriesIntervalDate): Promise<SpinalDateValue[]> {
    SpinalGraphService._addNode(endpoint);
    try {
      if (!this.serviceTimeseries) {
        throw new Error('Service timeseries is not initialized.');
      }
      return await this.serviceTimeseries.getData(endpoint.getId().get(), intervalDate, true);
    } catch (error) {
      console.warn(`Failed to get timeseries for endpoint "${endpoint.getName().get()}" (server_id: ${endpoint._server_id}):`, (error as Error).message);
      return [];
    }
  }

  async getEndpointValueAtTime(endpoint: SpinalNode<any>, timestamp: number): Promise<number | null> {
    const date = new Date(timestamp);
    const data = await this.getEndpointTimeseries(endpoint, { start: date, end: date });
    if (data.length === 0) return null;
    const value = data[data.length - 1].value;
    if (typeof value !== 'number' || !isFinite(value)) {
      console.warn(`Non-finite value (${value}) for endpoint "${endpoint.getName().get()}" (server_id: ${endpoint._server_id}) at ${date.toISOString()}`);
      return null;
    }
    return value;
  }


  async initBuildingEndpoints() {
    const graph = SpinalGraphService.getGraph();
    const contexts = await graph.getChildren('hasContext');
    const spatialContext = contexts.find((ctx) => ctx.getName().get() === 'spatial');
    if (!spatialContext) {
      throw new Error('Spatial context not found in the graph.');
    }
    const buildingNodes = await spatialContext.getChildren('hasGeographicBuilding');
    const buildingNode = buildingNodes[0];
    if (!buildingNode) {
      throw new Error('No building node found in spatial context.');
    }
    const buildingEndpoints = await buildingNode.getChildren('hasBmsEndpoint');
    console.log(`Found ${buildingEndpoints.length} building-level BMS endpoints.`);
    this.buildingEndpoints = buildingEndpoints;

    const outsideTemp = buildingEndpoints.find((ep) => ep.getName().get() === 'METEO/TempExt');
    if (!outsideTemp) {
      throw new Error('Building endpoint "METEO/TempExt" not found.');
    }
    this.outsideTempEndpoint = outsideTemp;

    const hygrometry = buildingEndpoints.find((ep) => ep.getName().get() === 'METEO/HygroExt');
    if (!hygrometry) {
      throw new Error('Building endpoint "METEO/HygroExt" not found.');
    }
    this.hygrometryEndpoint = hygrometry;

    console.log('Meteo endpoints initialized (TempExt, HygroExt).');
  }


  async getEquipmentGroup(): Promise<SpinalNode> {
    const graph = SpinalGraphService.getGraph();
    const contexts = await graph.getChildren('hasContext');

    const equipmentContext = contexts.find((ctx) => ctx.getName().get() === process.env.CONTEXT_NAME);
    if (!equipmentContext) {
      throw new Error(`Context "${process.env.CONTEXT_NAME}" not found in the graph.`);
    }
    const categories = await equipmentContext.getChildren('hasCategory');
    const category = categories.find((cat) => cat.getName().get() === process.env.CATEGORY_NAME);
    if (!category) {
      throw new Error(`Category "${process.env.CATEGORY_NAME}" not found in context "${process.env.CONTEXT_NAME}".`);
    }

    const groups = await category.getChildren('hasGroup');
    const group = groups.find((grp) => grp.getName().get() === process.env.GROUP_NAME);
    if (!group) {
      throw new Error(`Group "${process.env.GROUP_NAME}" not found in category "${process.env.CATEGORY_NAME}".`);
    }

    return group;
  }


  async getSpecialRoomsGroup(): Promise<SpinalNode> {
    const graph = SpinalGraphService.getGraph();
    const contexts = await graph.getChildren('hasContext');

    const ctx = contexts.find((c) => c.getName().get() === process.env.SPECIAL_ROOM_CONTEXT_NAME);
    if (!ctx) {
      throw new Error(`Context "${process.env.SPECIAL_ROOM_CONTEXT_NAME}" not found in the graph.`);
    }
    const categories = await ctx.getChildren('hasCategory');
    const category = categories.find((cat) => cat.getName().get() === process.env.SPECIAL_ROOM_CATEGORY_NAME);
    if (!category) {
      throw new Error(`Category "${process.env.SPECIAL_ROOM_CATEGORY_NAME}" not found in context "${process.env.SPECIAL_ROOM_CONTEXT_NAME}".`);
    }
    const groups = await category.getChildren('hasGroup');
    const group = groups.find((grp) => grp.getName().get() === process.env.SPECIAL_ROOM_GROUP_NAME);
    if (!group) {
      throw new Error(`Group "${process.env.SPECIAL_ROOM_GROUP_NAME}" not found in category "${process.env.SPECIAL_ROOM_CATEGORY_NAME}".`);
    }
    return group;
  }


  public async sendEmail(attachmentPaths: string[], subject: string, text: string) {
    const mailer = new SpinalMailer({
      host: process.env.SMTP_HOST!,
      port: 465,
      secure: true,
      auth: {
        user: process.env.SMTP_EMAIL!,
        pass: process.env.SMTP_PASS!,
      }
    });

    await mailer.verify();

    const attachments = attachmentPaths.map((p) => ({
      filename: path.basename(p),
      path: p,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }));

    await mailer.send({
      from: process.env.MAIL_FROM!,
      to: process.env.MAIL_TO!,
      subject,
      text,
      attachments,
    });

    console.log(`Email sent to ${process.env.MAIL_TO} with ${attachments.length} attachment(s).`);
  }

  public async initTicketMap(weekStart: Date, weekEnd: Date): Promise<TicketCountMap> {
    const graph = SpinalGraphService.getGraph();
    const contexts = await graph.getChildren('hasContext');
    const ticketContext = contexts.find((ctx) => ctx.getName().get() === process.env.TICKET_CONTEXT);
    if (!ticketContext) {
      throw new Error(`Ticket context "${process.env.TICKET_CONTEXT}" not found in the graph.`);
    }

    const startTs = weekStart.getTime();
    const endTs = weekEnd.getTime();

    const ticketCountMap: TicketCountMap = {};
    const ticketProcesses = await ticketContext.getChildren('SpinalSystemServiceTicketHasProcess');

    for (const proc of ticketProcesses) {
      const processName = proc.getName().get();
      if (!(processName in PROCESS_NAME_TO_TOKEN)) {
        console.warn(`Unknown ticket process "${processName}". Skipping.`);
        continue;
      }

      if (!ticketCountMap[processName]) {
        ticketCountMap[processName] = { attenteLect: 0, attenteReal: 0, realisationPartielle: 0, refusee: 0, cloturee: 0 };
      }

      const ticketSteps = await proc.getChildren('SpinalSystemServiceTicketHasStep');
      for (const step of ticketSteps) {
        const stepName = step.getName().get();
        const status = STEP_NAME_TO_STATUS[stepName];
        if (!status) {
          console.warn(`Unknown ticket step "${stepName}" in process "${processName}". Skipping.`);
          continue;
        }

        const tickets = await step.getChildren('SpinalSystemServiceTicketHasTicket');
        for (const ticket of tickets) {
          const creationDate = ticket.info.creationDate?.get();
          if (creationDate && creationDate >= startTs && creationDate < endTs) {
            ticketCountMap[processName][status]++;
          }
        }
      }
    }

    console.log('TicketCountMap built:');
    for (const [key, statuses] of Object.entries(ticketCountMap)) {
      const total = Object.values(statuses).reduce((a, b) => a + b, 0);
      if (total > 0) {
        console.log(`  ${key}: attente=${statuses.attente} cloturee=${statuses.cloturee} partielle=${statuses.realisationPartielle} refusee=${statuses.refusee} total=${total}`);
      }
    }

    return ticketCountMap;
  }
}


async function generateAndSendTemp(spinalMain: SpinalMain, outputPaths: string[]) {
  if (outputPaths.length === 0) return;
  const now = new Date();
  const dateStr = now.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const subject = process.env.TEMP_MAIL_SUBJECT || `Relevé de températures du ${dateStr}`;
  const text = `Bonjour,\n\nVeuillez trouver ci-joint le(s) relevé(s) de températures du ${dateStr}.\n\nCordialement`;
  console.log('Sending temperature email...');
  await spinalMain.sendEmail(outputPaths, subject, text);
  // for (const filePath of outputPaths) {
  //   try {
  //     unlinkSync(filePath);
  //     console.log(`Deleted: ${filePath}`);
  //   } catch (err) {
  //     console.warn(`Failed to delete ${filePath}:`, (err as Error).message);
  //   }
  // }
}


async function generateAndSendTickets(spinalMain: SpinalMain, outputPaths: string[]) {
  if (outputPaths.length === 0) return;
  const now = new Date();
  const dateStr = now.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const subject = process.env.TICKET_MAIL_SUBJECT || `Rapport hebdomadaire tickets du ${dateStr}`;
  const text = `Bonjour,\n\nVeuillez trouver ci-joint le rapport hebdomadaire des tickets.\n\nCordialement`;
  console.log('Sending ticket email...');
  await spinalMain.sendEmail(outputPaths, subject, text);
  // for (const filePath of outputPaths) {
  //   try {
  //     unlinkSync(filePath);
  //     console.log(`Deleted: ${filePath}`);
  //   } catch (err) {
  //     console.warn(`Failed to delete ${filePath}:`, (err as Error).message);
  //   }
  // }
}


async function runTempReport(spinalMain: SpinalMain, period: 'morning' | 'evening') {
  const enableTemp = process.env.ENABLE_TEMP_REPORT !== 'false';
  if (!enableTemp) {
    console.log('Temperature report skipped (ENABLE_TEMP_REPORT=false).');
    return;
  }

  console.log(`--- Temperature Report (${period}) ---`);
  const floorZoneMap = await buildFloorZoneMap(spinalMain);
  const outputPath = await generateTempReport(spinalMain, floorZoneMap, period);
  await generateAndSendTemp(spinalMain, [outputPath]);
  console.log('Done.');
}


async function runTicketReport(spinalMain: SpinalMain) {
  const enableTickets = process.env.ENABLE_TICKET_REPORT !== 'false';
  if (!enableTickets) {
    console.log('Ticket report skipped (ENABLE_TICKET_REPORT=false).');
    return;
  }

  console.log('--- Ticket Report ---');
  const ticketPath = await generateWeeklyTicketReport(spinalMain);
  await generateAndSendTickets(spinalMain, [ticketPath]);
  console.log('Done.');
}


async function runAllReports(spinalMain: SpinalMain) {
  const enableTemp = process.env.ENABLE_TEMP_REPORT !== 'false';
  const enableTickets = process.env.ENABLE_TICKET_REPORT !== 'false';
  const tempOutputPaths: string[] = [];
  const ticketOutputPaths: string[] = [];

  if (enableTemp) {
    console.log('--- Temperature Reports (--run-now) ---');
    const floorZoneMap = await buildFloorZoneMap(spinalMain);
    const morningPath = await generateTempReport(spinalMain, floorZoneMap, 'morning');
    const eveningPath = await generateTempReport(spinalMain, floorZoneMap, 'evening');
    tempOutputPaths.push(morningPath, eveningPath);
  }

  if (enableTickets) {
    console.log('--- Ticket Report (--run-now) ---');
    const ticketPath = await generateWeeklyTicketReport(spinalMain);
    ticketOutputPaths.push(ticketPath);
  }

  await generateAndSendTemp(spinalMain, tempOutputPaths);
  await generateAndSendTickets(spinalMain, ticketOutputPaths);
  console.log('Done.');
}


async function Main() {
  const spinalMain = new SpinalMain();
  await spinalMain.init();
  await spinalMain.initBuildingEndpoints();

  const args = process.argv.slice(2);

  if (args.includes('--run-temp')) {
    console.log('[--run-temp] Running temperature reports immediately...');
    const floorZoneMap = await buildFloorZoneMap(spinalMain);
    const morningPath = await generateTempReport(spinalMain, floorZoneMap, 'morning');
    const eveningPath = await generateTempReport(spinalMain, floorZoneMap, 'evening');
    await generateAndSendTemp(spinalMain, [morningPath, eveningPath]);
    process.exit(0);
  }

  if (args.includes('--run-tickets')) {
    console.log('[--run-tickets] Running ticket report immediately...');
    const ticketPath = await generateWeeklyTicketReport(spinalMain);
    await generateAndSendTickets(spinalMain, [ticketPath]);
    process.exit(0);
  }

  if (args.includes('--run-now')) {
    console.log('[--run-now] Running all reports immediately...');
    await runAllReports(spinalMain);
    process.exit(0);
  }

  // Temperature: morning at 8:30 and evening at 13:30, Mon-Fri
  console.log('Scheduling temperature reports: 8:30 (morning) & 13:30 (evening) Mon-Fri');
  const morningJob = new CronJob('30 8 * * 1-5', async () => {
    try {
      console.log('Starting morning temperature report...');
      await runTempReport(spinalMain, 'morning');
    } catch (err) {
      console.error('Error generating morning temp report:', (err as Error).message);
    }
  });
  morningJob.start();

  const eveningJob = new CronJob('30 13 * * 1-5', async () => {
    try {
      console.log('Starting evening temperature report...');
      await runTempReport(spinalMain, 'evening');
    } catch (err) {
      console.error('Error generating evening temp report:', (err as Error).message);
    }
  });
  eveningJob.start();

  // Tickets: configurable cron via TICKET_CRON (default: every Friday at 7pm)
  const ticketCron = process.env.TICKET_CRON || '0 19 * * 5';
  console.log(`Scheduling ticket report: ${ticketCron}`);
  const ticketJob = new CronJob(ticketCron, async () => {
    try {
      console.log('Starting weekly ticket report...');
      await runTicketReport(spinalMain);
    } catch (err) {
      console.error('Error generating ticket report:', (err as Error).message);
    }
  });
  ticketJob.start();
}
Main();
