import GUN from 'gun';
import md5 from 'md5';
import {
	createRxDatabase,
	/* ... */
} from 'rxdb';
import { addRxPlugin } from 'rxdb';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
addRxPlugin(RxDBDevModePlugin);
import {
	getRxStorageMemory
} from 'rxdb/plugins/storage-memory';
import {
	getRxStorageFoundationDB
} from 'rxdb/plugins/storage-foundationdb';
import {
	getRxStorageMongoDB
} from 'rxdb/plugins/storage-mongodb';
import { RxDBMigrationPlugin } from 'rxdb/plugins/migration-schema';
addRxPlugin(RxDBMigrationPlugin);

const tagSchema = {//TODO добавить юзера-создателя и подписчиков?
	version: 0,
	primaryKey: 'id',
	type: 'object',
	properties: {
		id: {
			type: 'string',
			maxLength: 100
		},
		name: {
			type: 'string'
		},
		path: {
			type: 'string'
		},
		description: {
			type: 'string'
		},
		parent_id: {
			type: 'string'
		},
		time: {
			type: 'datetime'
		}
	},
	required: ['id', 'name']
}

const userSchema = {
	version: 1,
	primaryKey: 'id',
	type: 'object',
	properties: {
		id: {
			type: 'string',
			maxLength: 100
		},
		name: {//внезапно оказалось что его может и не быть))
			type: 'string'
		},
		first_name: {
			type: 'string'
		},
		last_name: {
			type: 'string'
		},
		language_code: {
			type: 'string'
		},
		nowtag: {
			type: 'string'
		},
		state: {
			type: 'string'
		},
		message_id: {
			type: 'integer'
		}
	},
	required: ['id']
}

class DB {//класс с расчетом на использование и в браузере/вебаппе
	tags = {}
	tagChilds = {}
	trees = {}
	constructor() {
		this.GUN = GUN; //new require('gun');
		this.gun = new this.GUN();
		this.data = {};
	}
	async createRxDatabase(storage, connection, name = 'testdb') {
		console.log("createRxDB", storage, connection, name);
		var db;
		if (storage == 'memory') {
			db = await createRxDatabase({
				name: 'db',
				storage: getRxStorageMemory()
			});
		}
		if (storage == 'foundationdb') {
			db = await createRxDatabase({
				name: 'db',
				storage: getRxStorageFoundationDB()
			});
		}
		if (storage == 'mongodb') {
			db = await createRxDatabase({
				name: name,
				storage: getRxStorageMongoDB({
					connection
				})
			});
		}
		await db.addCollections({
			tags: {
				schema: tagSchema
			}
		});
		await db.addCollections({
			users: {
				schema: userSchema,
				migrationStrategies: {
					// 1 means, this transforms data from version 0 to version 1
					1: function(oldDoc){
						return oldDoc;
					}
				}				
			}
		});
		this.rx = db;
		console.log("rx created");
	}
	user(user) {
		var ret = this.data[user];
		console.log("DB", user, ret);
		if (!ret) { ret = { "friends": {} } };
		return ret;
	}
	useTree(tree) {
		this.nowTree = tree;
	}
	async addTags(tags) {
		var parent = null;
		for (const tag of tags) {
			const tr = await this.addTag(parent, [tag]);
			if (tr) {
				console.log("tag added!!", tr.id, tr.name);
				parent = tr.id;
			} else {
				console.log("tag not added");
			}
		}
		return parent;
	}
	async touch(tag, level = 5) {
		await tag.incrementalPatch({ time: Date.now() });
		if (tag.parent_id && level > 0) {
			const parent = await this.getTag(tag.parent_id);
			await this.touch(parent, level - 1);
		}
	}
	async addTag(parent, arr) {
		const name = arr.shift().toLowerCase();
		//console.log("addTag start", name, parent);
		const description = arr.join("\n");
		var path = "";
		if (parent) {
			const ntag = await this.getTag(parent);
			//console.log("parent", ntag?.name, ntag?.hash, ntag?.parent);
			path = ntag?.path + ntag?.name + " #";
			await this.touch(ntag);
		} else {
			path = "#";
		}
		const hash = md5(path + name);
		//const data = { name, description, path, hash, parent };
		//this.tags[hash] = data;
		//this.printTags();
		const tag = await this.getTag(hash);
		if (tag) {
			return tag;
		}
		const doc = await this.rx.tags.insert({
			id: hash,
			name: name,
			path,
			parent_id: parent,
			description,
			time: Date.now()
		});
		//console.log("rx tag insert", doc.id, doc.name, doc.time);
		return doc;
	}
	async getTag(id) {
		//console.log("in getTag", id);
		if (!id) return null;
		return this.rx.tags.findOne({
			selector: {
				id: id
			}
		}).exec();
	}
	upTag(hash) {//TODO

	}
	async getTagChilds(hash, skip = 0) {//решил сделать по простому)
		//const treeData = await tree.then();
		//console.log("getTagChilds", hash);
		const query = this.rx.tags.find({
			selector: {
				parent_id: hash
			},
			sort: [
				{ time: 'desc' }
			]
		});
		//if (!treeData || !treeData.name){
		//  return [];
		//}
		//потом эти массивы буду храниться у пользователей локально
		const tags = await query.exec();
		var ret = [];
		for (const tag of tags) {
			ret.push({ name: tag.name, id: tag.id, description: tag.description });
		}
		//console.log("getTagChilds ret", ret);
		return ret;
	}
	async printTags() {
		console.log("~~~~~~~~~~~~~~~~~~~");
		const tags = await this.rx.tags.find({
		}).exec();
	}
	createTree(tree) {
		this.trees[tree] = {};
		this.useTree(tree);
	}
	async getUser(id) {
		if (!id) return null;
		//console.log("try get user", id, String(id));
		const query = this.rx.users.findOne({
			selector: {
				id: String(id)
			}
		});
		const user = await query.exec();
		//console.log("user", user?.toJSON());
		if (user) return user;
		return null;
	}
	async createUser(user) {
		const u = await this.getUser(user?.id);
		console.log("createUser start", u?.toJSON(), user);
		if (u) return u;
		const ret = await this.rx.users.insert({
			id: String(user?.id),
			name: user?.username,
			first_name: user?.first_name,
			last_name: user?.last_name,
			language_code: user?.language_code
		});
		console.log("createUser after", ret.toJSON());
		return ret;
	}
	async getTextChild(id, level = 1) {//TODO тут сложно будет. сортировку по лайкнувшим людям? вообще всем?
		//или каждому свое показывается?
		if (!id) return "";
		const tags = await this.getTagChilds(id);
		//console.log("text tags", tags);
		var ret = "\n";
		if (level > 1) return ret;
		for (const tag of tags) {
			ret += ">".repeat(level) + " " + tag.name;//TODO пока так, а потом надо будет что-то придумать
			if (false && tag.description) { //TODO тут подумать, но вроде пока он тут не нужен.
				//либо это настраиваемая опция?
				//TODO если это ссылка - то добавлять её к имени
				//в принципе любая первая ссылка из описания?
				ret += "\n " + tag.description
			};
			//ret += "\n";
			ret += await this.getTextChild(tag.id, level + 1);
		}
		return ret;
	}
}

export default DB;
