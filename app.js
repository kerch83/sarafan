//const DB = require("./db.js");

import DB from './db.js';
import Bot from './bot.js'
//console.log(DB);
var db = new DB();
var dbname = 'db';
if (process.env?.MODE == "DEV") {
    dbname = "testdb";
};
await db.createRxDatabase(process.env.RX_STORAGE, process.env.RX_CONNECTION, dbname);
import i18n from './i18n.config.js';
console.log("----------------", Date.now().toLocaleString());

var bot = new Bot();
bot.init(process.env.TOKEN, db, i18n, process.env.TAGS);
bot.start();

console.log("app started");
//import { I18n } from 'i18n';
