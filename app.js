//const DB = require("./db.js");

import DB from './db.cjs';
import Bot from './bot.cjs'
//console.log(DB);
var db = new DB();
import i18n from './i18n.config.js';
console.log(i18n.__("start"));

var bot = new Bot(process.env.TOKEN, db.gun, i18n);
bot.start();

console.log("app started");
//import { I18n } from 'i18n';
