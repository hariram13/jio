/*
 * Copyright 2017, Nexedi SA
 *
 * This program is free software: you can Use, Study, Modify and Redistribute
 * it under the terms of the GNU General Public License version 3, or (at your
 * option) any later version, as published by the Free Software Foundation.
 *
 * You can also Link and Combine this program with other software covered by
 * the terms of any of the Free Software licenses or any of the Open Source
 * Initiative approved licenses and Convey the resulting work. Corresponding
 * source of such a combination shall include the source code for all other
 * software used.
 *
 * This program is distributed WITHOUT ANY WARRANTY; without even the implied
 * warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 *
 * See COPYING file for full licensing terms.
 * See https://www.nexedi.com/licensing for rationale and options.
 */
/*jslint nomen: true */
/*global RSVP, UriTemplate*/
(function (jIO, RSVP, UriTemplate) {
  "use strict";

  var GET_POST_URL = "https://graph.facebook.com/v2.9/{+post_id}" +
      "?fields={+fields}&access_token={+access_token}",
    get_post_template = UriTemplate.parse(GET_POST_URL),
    GET_FEED_URL = "https://graph.facebook.com/v2.9/{+user_id}/feed" +
        "?fields={+fields}&limit={+limit}&since={+since}&access_token=" +
        "{+access_token}",
    get_feed_template = UriTemplate.parse(GET_FEED_URL);

  function FBStorage(spec) {
    if (typeof spec.access_token !== 'string' || !spec.access_token) {
      throw new TypeError("Access Token must be a string " +
                          "which contains more than one character.");
    }
    if (typeof spec.user_id !== 'string' || !spec.user_id) {
      throw new TypeError("User ID must be a string " +
                          "which contains more than one character.");
    }
    this._access_token = spec.access_token;
    this._user_id = spec.user_id;
    this._default_field_list = spec.default_field_list || [];
    this._default_limit = spec.default_limit || 500;
  }

  FBStorage.prototype.get = function (id) {
    var that = this;
    return new RSVP.Queue()
      .push(function () {
        return jIO.util.ajax({
          type: "GET",
          url: get_post_template.expand({post_id: id,
            fields: that._default_field_list, access_token: that._access_token})
        });
      })
      .push(function (result) {
        return JSON.parse(result.target.responseText);
      });
  };

  function paginateResult(url, result, select_list) {
    return new RSVP.Queue()
      .push(function () {
        return jIO.util.ajax({
          type: "GET",
          url: url
        });
      })
      .push(function (response) {
        return JSON.parse(response.target.responseText);
      },
        function (err) {
          throw new jIO.util.jIOError("Getting feed failed " + err.toString(),
            err.target.status);
        })
      .push(function (response) {
        if (response.data.length === 0) {
          return result;
        }
        var i, j, obj = {};
        for (i = 0; i < response.data.length; i += 1) {
          obj.id = response.data[i].id;
          obj.value = {};
          for (j = 0; j < select_list.length; j += 1) {
            obj.value[select_list[j]] = response.data[i][select_list[j]];
          }
          result.push(obj);
          obj = {};
        }
        return paginateResult(response.paging.next, result, select_list);
      });
  }

  FBStorage.prototype.buildQuery = function (query) {
    var that = this, fields = [], limit = this._default_limit,
      template_argument = {
        user_id: this._user_id,
        limit: limit,
        access_token: this._access_token
      };
    if (query.include_docs) {
      fields = fields.concat(that._default_field_list);
    }
    if (query.select_list) {
      fields = fields.concat(query.select_list);
    }
    if (query.limit) {
      limit = query.limit[1];
    }
    template_argument.fields = fields;
    template_argument.limit = limit;
    return paginateResult(get_feed_template.expand(template_argument), [],
      fields)
      .push(function (result) {
        if (!query.limit) {
          return result;
        }
        return result.slice(query.limit[0], query.limit[1]);
      });
  };

  FBStorage.prototype.hasCapacity = function (name) {
    var this_storage_capacity_list = ["list", "select", "include", "limit"];
    if (this_storage_capacity_list.indexOf(name) !== -1) {
      return true;
    }
  };

  jIO.addStorage('facebook', FBStorage);

}(jIO, RSVP, UriTemplate));