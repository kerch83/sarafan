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

const tagSchema = {
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
	required: ['id', 'name']
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
	async createRxDatabase() {
		const db = await createRxDatabase({
			name: 'db',
			storage: getRxStorageMemory()
		});
		await db.addCollections({
			tags: {
				schema: tagSchema
			}
		});
		await db.addCollections({
			users: {
				schema: userSchema
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
	async touch(tag, level = 5){
		await tag.incrementalPatch({time: Date.now()});
		if (tag.parent_id && level> 0){
			const parent = await this.getTag(tag.parent_id);
			await this.touch(parent, level - 1);
		}
	}
	async addTag(parent, arr) {
		const name = arr.shift().toLowerCase();
		console.log("addTag start", name, parent);
		const description = arr.join("\n");
		var path = "";
		if (parent) {
			const ntag = await this.getTag(parent);
			console.log("parent", ntag?.name, ntag?.hash, ntag?.parent);
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
		if (tag){
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
		console.log("rx tag insert", doc.id, doc.name, doc.time);
		return doc;
	}
	async getTag(id) {
		console.log("in getTag", id);
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
		console.log("getTagChilds", hash);
		const query = this.rx.tags.find({
      selector: {
        parent_id: hash
      },
			sort: [
        {time: 'desc'}
      ]
    });
		//if (!treeData || !treeData.name){
		//  return [];
		//}
		//потом эти массивы буду храниться у пользователей локально
		const tags = await query.exec();
		var ret = [];
		for (const tag of tags){
			ret.push({name:tag.name, hash: tag.id});
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
	async getUser(username){
		const query = this.rx.users.findOne({
      selector: {
        name: username
      }
    });
		const user = await query.exec();
		if (user) return user;
		return null;
	}
	async createUser(username, chatId){
		const user = await this.getUser(username);
		console.log("createUser start", user?.toJSON());
		if (user) return user;
		const ret = await this.rx.users.insert({
			id: String(chatId),
			name: username
		});
		console.log("createUser after", ret.toJSON());
		return ret;
	}
}

export default DB;
