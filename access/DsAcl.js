/**
 * Created by krasilneg on 28.11.18.
 */

'use strict';

const { AclProvider, Permissions } = require('@iondv/acl-contracts');
const merge = require('merge');
const { FunctionCodes: F } = require('@iondv/meta-model-contracts');
const { User } = require('@iondv/auth-contracts');

/**
 *
 * @param {{}} config
 * @param {String} [config.allAlias]
 * @param {DataSource} config.dataSource
 * @constructor
 */
function DsAcl(config) {

  const globalMarker = config.allAlias ? config.allAlias : '*';

  const roles_table = 'ion_acl_user_roles';

  const perms_table = 'ion_acl_permissions';

  /**
   * @returns {Promise}
   * @private
   */
  this._init = function () {
    return config.dataSource.ensureIndex(perms_table, {subject: 1, resource: 1, permission: 1}, {unique: true})
      .then(() => config.dataSource.ensureIndex(perms_table, {subject: 1}, {}))
      .then(() => config.dataSource.ensureIndex(perms_table, {resource: 1}, {}))
      .then(() => config.dataSource.ensureIndex(perms_table, {permission: 1}, {}))
      .then(() => config.dataSource.ensureIndex(roles_table, {user: 1}, {unique: true}));
  };

  function addSubject(subj, subject) {
    if (subject instanceof User) {
      subj.push(subject.id());
      subj.push(...subject.coactors());
    } else if (typeof subject === 'string') {
      subj.push(subject);
    } else if (Array.isArray(subject)) {
      subject.forEach(s => addSubject(subj, s));
    }
  }

  /**
   * @param {String | User} subject
   * @param {String} resource
   * @param {String | String[]} permissions
   * @returns {Promise}
   */
  this._checkAccess = function (subject, resource, permissions) {
    if (!subject || !resource || !permissions) {
      return Promise.resolve(false);
    }
    const perms = Array.isArray(permissions) ? permissions.slice() : [permissions];
    if (perms.indexOf(Permissions.FULL) < 0) {
      perms.push(Permissions.FULL);
    }
    const res = [resource, globalMarker];
    const subj = [globalMarker];
    addSubject(subj, subject);

    return (
      (typeof subject === 'string') ?
        config.dataSource.get(roles_table, {[F.EQUAL]: ['$user', subject]})
          .then((roles) => {
            if (roles) {
              roles.roles.forEach((r) => {
                subj.push(r);
              });
            }
          }) : Promise.resolve())
      .then(
        () => config.dataSource.fetch(
          perms_table,
          {
            filter: {
              [F.AND]: [
                {
                  [F.IN]: ['$subject', subj]
                },
                {
                  [F.IN]: ['$resource', res]
                },
                {
                  [F.IN]: ['$permission', perms]
                }
              ]
            }
          }
        )
      )
      .then(result => result.length ? true : false);
  };

  /**
   * @param {String} subjects
   * @param {String | String[]} resources
   * @returns {Promise}
   */
  this._getPermissions = function (subjects, resources, skipGlobals) {
    if (!subjects || !resources) {
      return Promise.resolve({});
    }
    const r = Array.isArray(resources) ? resources.slice() : [resources];
    const returnGlobal = r.indexOf(globalMarker) >= 0;
    const subj = [];
    addSubject(subj, subjects);
    if (!skipGlobals) {
      if (r.indexOf(globalMarker) < 0) {
        r.push(globalMarker);
      }
      subj.push(globalMarker);
    }
    return config.dataSource.fetch(roles_table, {filter: {[F.IN]: ['$user', subj]}})
      .then((users) => {
        users.forEach((u) => {
          subj.push(...u.roles);
        });
        return config.dataSource.fetch(
          perms_table,
          {
            filter: {
              [F.AND]: [
                {
                  [F.IN]: ['$subject', subj]
                },
                {
                  [F.IN]: ['$resource', r]
                }
              ]
            }
          }
        );
      })
      .then((result) => {
        const res = {};
        r.forEach((resource) => {
          res[resource] = {};
        });
        result.forEach((p) => {
          if (!(p.subject === globalMarker && skipGlobals)) {
            if (p.permission === Permissions.FULL) {
              res[p.resource][Permissions.FULL] = true;
              res[p.resource][Permissions.READ] = true;
              res[p.resource][Permissions.WRITE] = true;
              res[p.resource][Permissions.USE] = true;
              res[p.resource][Permissions.DELETE] = true;
            } else {
              res[p.resource][p.permission] = true;
            }
          }
        });

        if (!skipGlobals && res.hasOwnProperty(globalMarker)) {
          r.forEach((resource) => {
            merge(res[resource], res[globalMarker]);
          });
        }

        if (!returnGlobal) {
          delete res[globalMarker];
        }
        return res;
      });
  };

/**
 * @param {String} subject
 * @param {String | String[]} permissions
 * @returns {Promise}
 */
this._getResources = function (subject, permissions) {
  if (!subject) {
    return Promise.resolve([]);
  }
  let p = Array.isArray(permissions) ? permissions.slice() : [permissions];
  if (p.indexOf(globalMarker) < 0) {
    p.push(globalMarker);
  }

  return config.dataSource.get(roles_table, {[F.EQUAL]: ['$user', subject]})
    .then((roles) => {
      let subj = [subject];
      if (roles) {
        roles.roles.forEach((r) => {
          subj.push(r);
        });
      }

      return config.dataSource.fetch(
        perms_table,
        {
          filter: {
            [F.AND]: [
              {
                [F.IN]: ['$subject', subj]
              },
              {
                [F.IN]: ['$permission', p]
              }
            ]
          },
          distinct: true,
          select: ['resource']
        }
      );
    })
    .then((res) => {
      const result = [];
      res.forEach((r) => {
        result.push(r.resource);
      });
      return result;
    });
};

/**
 * @param {String} subject
 * @returns {Promise}
 */
this._getCoactors = function (subject) {
  return subject ? config.dataSource.get(roles_table, {[F.EQUAL]: ['$user', subject]}).then(u => u ? u.roles : []) : [];
};

}

DsAcl.prototype = new AclProvider();

module.exports = DsAcl;
