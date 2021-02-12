/* eslint-disable func-names */
const { changelogger: { EventLogger } } = require('@iondv/commons');
const { User } = require('@iondv/auth-contracts');
const { FunctionCodes: F } = require('@iondv/meta-model-contracts');

/**
 * @param {table: String, DataSource: dataSource} options
 */
function dsRoleAccessChangeLogger(options) {

  this.options = options;

  this.types = function() {
    return {
      ASSIGN_ROLE: 'ASSIGN_ROLE',
      GRANT: 'GRANT',
      DENY: 'DENY',
      UNASSIGN_ROLE: 'UNASSIGN_ROLE',
      UNDEFINE_ROLE: 'UNDEFINE_ROLE',
      DEFINE_ROLE: 'DEFINE_ROLE'
    };
  };

  this.normalize = function(datas) {
    if (!(datas.author instanceof User))
      throw new Error('Author not specified!');
    const result = {
      authorId: datas.author.id(),
      authorName: datas.author.name(),
      authorIp: datas.author.properties().ip,
      before: datas.before,
      updates: datas.updates
    };
    if (datas.user) {
      result.userId = datas.user.id();
      result.userName = datas.user.name();
    } else if (datas.role) {
      result.role = datas.role;
    } else {
      throw new Error('Subject not specified!');
    }
    return result;
  };

  this.filter = function(filters) {
    const result = [];
    if (filters.author) {
      result.push({[F.OR]: [
        {[F.EQUAL]: ['$authorId', filters.author]},
        {[F.EQUAL]: ['$authorName', filters.author]}
      ]});
    }
    if (filters.ip)
      result.push({[F.EQUAL]: ['$authorIp', filters.ip]});
    if (filters.subject) {
      result.push({[F.OR]: [
        {[F.EQUAL]: ['$userId', filters.subject]},
        {[F.EQUAL]: ['$userName', filters.subject]},
        {[F.EQUAL]: ['$role', filters.subject]}
      ]});
    }
    return result;
  };

  this.record = function(rec) {
    rec.subject = rec.userId || rec.role;
    return rec;
  };
}

dsRoleAccessChangeLogger.prototype = new EventLogger();
module.exports = dsRoleAccessChangeLogger;
