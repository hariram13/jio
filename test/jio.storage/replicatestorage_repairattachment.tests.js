/*
 * Copyright 2014, Nexedi SA
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
/*jslint nomen: true*/
/*global Blob, RSVP*/
(function (jIO, QUnit, Blob, RSVP) {
  "use strict";
  var test = QUnit.test,
    stop = QUnit.stop,
    start = QUnit.start,
    ok = QUnit.ok,
    expect = QUnit.expect,
    deepEqual = QUnit.deepEqual,
    equal = QUnit.equal,
    module = QUnit.module,
    big_string = "",
    j;

  for (j = 0; j < 30; j += 1) {
    big_string += "a";
  }

  function StorageEmptyAllAttachments(spec) {
    this._sub_storage = jIO.createJIO(spec.sub_storage);
    return this;
  }
  jIO.addStorage('signaturestorageemptyallattachments',
                 StorageEmptyAllAttachments);
  StorageEmptyAllAttachments.prototype.allAttachments = function () {
    return {};
  };
  StorageEmptyAllAttachments.prototype.getAttachment = function () {
    return this._sub_storage.getAttachment.apply(this._sub_storage,
                                                 arguments);
  };
  StorageEmptyAllAttachments.prototype.putAttachment = function () {
    return this._sub_storage.putAttachment.apply(this._sub_storage,
                                                 arguments);
  };
  StorageEmptyAllAttachments.prototype.buildQuery = function () {
    return this._sub_storage.buildQuery.apply(this._sub_storage,
                                              arguments);
  };
  StorageEmptyAllAttachments.prototype.put = function () {
    return this._sub_storage.put.apply(this._sub_storage,
                                       arguments);
  };
  StorageEmptyAllAttachments.prototype.get = function () {
    return this._sub_storage.get.apply(this._sub_storage,
                                       arguments);
  };
  StorageEmptyAllAttachments.prototype.hasCapacity = function (name) {
    return (name !== 'bulk_get');
  };

  /////////////////////////////////////////////////////////////////
  // attachment replication
  /////////////////////////////////////////////////////////////////
  module("replicateStorage.repair.attachment", {
    setup: function () {
      // Uses memory substorage, so that it is flushed after each run
      this.jio = jIO.createJIO({
        type: "replicate",
        report_level: 1000,
        check_local_attachment_creation: true,
        check_local_attachment_modification: true,
        check_local_attachment_deletion: true,
        check_remote_attachment_creation: true,
        check_remote_attachment_modification: true,
        check_remote_attachment_deletion: true,
        local_sub_storage: {
          type: "uuid",
          sub_storage: {
            type: "memory"
          }
        },
        remote_sub_storage: {
          type: "uuid",
          sub_storage: {
            type: "memory"
          }
        }
      });

    }
  });

  test("local attachment creation", function () {
    stop();
    expect(3);

    var id,
      context = this,
      blob = new Blob([big_string]);

    context.jio.post({"title": "foo"})
      .then(function (result) {
        id = result;
        return context.jio.putAttachment(id, "foo", blob);
      })
      .then(function () {
        return context.jio.repair();
      })
      .then(function (report) {
        deepEqual(report._list, [
          [report.LOG_PUT_REMOTE, id],
          [report.LOG_PUT_REMOTE_ATTACHMENT, id, 'foo']
        ]);
        return context.jio.__storage._remote_sub_storage.getAttachment(
          id,
          "foo",
          {format: "text"}
        );
      })
      .then(function (result) {
        equal(result, big_string);
        return context.jio.__storage._signature_sub_storage
                      .getAttachment(id, "foo", {format: "json"});
      })
      .then(function (result) {
        deepEqual(result, {
          hash: "cd762363c1c11ecb48611583520bba111f0034d4"
        });
      })
      .fail(function (error) {
        ok(false, error);
      })
      .always(function () {
        start();
      });
  });

  test("local attachment creation, local document creation not checked",
       function () {
      stop();
      expect(7);

      var id,
        context = this,
        blob = new Blob([big_string]);

      this.jio = jIO.createJIO({
        type: "replicate",
        report_level: 1000,
        check_local_creation: false,
        check_local_attachment_creation: true,
        local_sub_storage: {
          type: "uuid",
          sub_storage: {
            type: "memory"
          }
        },
        remote_sub_storage: {
          type: "uuid",
          sub_storage: {
            type: "memory"
          }
        }
      });

      context.jio.post({"title": "foo"})
        .then(function (result) {
          id = result;
          return context.jio.putAttachment(id, "foo", blob);
        })
        .then(function () {
          return context.jio.repair();
        })
        .then(function (report) {
          deepEqual(report._list, [
            [report.LOG_SKIP_LOCAL_CREATION, id]
          ]);
          return context.jio.__storage._remote_sub_storage.getAttachment(
            id,
            "foo",
            {format: "text"}
          );
        })
        .fail(function (error) {
          ok(error instanceof jIO.util.jIOError);
          equal(error.status_code, 404);
          equal(error.message, "Cannot find attachment: " + id + " , foo");
          return context.jio.__storage._signature_sub_storage
                        .getAttachment(id, "foo", {format: "json"});
        })
        .fail(function (error) {
          ok(error instanceof jIO.util.jIOError);
          equal(error.status_code, 404);
          var error_message = "Cannot find attachment: " +
            "_replicate_b9296354cdf1dbe0046de11f57a5a24f8f6a78a8 , " +
            "jio_attachment/";
          equal(
            error.message.substring(0, error_message.length),
            error_message
          );
        })
        .fail(function (error) {
          ok(false, error);
        })
        .always(function () {
          start();
        });
    });

  test("local attachment creation not checked", function () {
    stop();
    expect(7);

    var id,
      context = this,
      blob = new Blob([big_string]);

    this.jio = jIO.createJIO({
      type: "replicate",
      report_level: 1000,
      check_local_attachment_creation: false,
      check_local_attachment_modification: true,
      local_sub_storage: {
        type: "uuid",
        sub_storage: {
          type: "memory"
        }
      },
      remote_sub_storage: {
        type: "uuid",
        sub_storage: {
          type: "memory"
        }
      }
    });

    context.jio.post({"title": "foo"})
      .then(function (result) {
        id = result;
        return context.jio.putAttachment(id, "foo", blob);
      })
      .then(function () {
        return context.jio.repair();
      })
      .then(function (report) {
        deepEqual(report._list, [
          [report.LOG_PUT_REMOTE, id],
          [report.LOG_SKIP_LOCAL_ATTACHMENT_CREATION, id, 'foo']
        ]);
        return context.jio.__storage._remote_sub_storage.getAttachment(
          id,
          "foo",
          {format: "text"}
        );
      })
      .fail(function (error) {
        ok(error instanceof jIO.util.jIOError);
        equal(error.status_code, 404);
        equal(error.message, "Cannot find attachment: " + id + " , foo");
        return context.jio.__storage._signature_sub_storage
                      .getAttachment(id, "foo", {format: "json"});
      })
      .fail(function (error) {
        ok(error instanceof jIO.util.jIOError);
        equal(error.status_code, 404);
        var error_message = "Cannot find attachment: " +
          "_replicate_b9296354cdf1dbe0046de11f57a5a24f8f6a78a8 , " +
          "jio_attachment/";
        equal(
          error.message.substring(0, error_message.length),
          error_message
        );
      })
      .fail(function (error) {
        ok(false, error);
      })
      .always(function () {
        start();
      });
  });

  test("local attachment creation, local document creation and use remote post",
       function () {
      stop();
      expect(5);

      var id,
        context = this,
        post_id,
        blob = new Blob([big_string]),
        report;

      this.jio = jIO.createJIO({
        type: "replicate",
        report_level: 1000,
        use_remote_post: true,
        check_local_attachment_creation: true,
        local_sub_storage: {
          type: "uuid",
          sub_storage: {
            type: "memory"
          }
        },
        remote_sub_storage: {
          type: "uuid",
          sub_storage: {
            type: "memory"
          }
        }
      });

      context.jio.post({"title": "foo"})
        .then(function (result) {
          id = result;
          return context.jio.putAttachment(id, "foo", blob);
        })
        .then(function () {
          return context.jio.repair();
        })
        // Another document should have been created
        .then(function (result) {
          report = result;
          return context.jio.__storage._remote_sub_storage.allDocs();
        })
        .then(function (result) {
          equal(result.data.total_rows, 1);
          post_id = result.data.rows[0].id;
          deepEqual(report._list, [
            [report.LOG_POST_REMOTE, id],
            [report.LOG_PUT_REMOTE_ATTACHMENT, post_id, 'foo']
          ]);
          return context.jio.getAttachment(
            post_id,
            "foo",
            {format: "text"}
          );
        })
        .then(function (result) {
          equal(result, big_string);
          return context.jio.__storage._remote_sub_storage.getAttachment(
            post_id,
            "foo",
            {format: "text"}
          );
        })
        .then(function (result) {
          equal(result, big_string);
          return context.jio.__storage._signature_sub_storage
                        .getAttachment(post_id, "foo", {format: "json"});
        })
        .then(function (result) {
          deepEqual(result, {
            hash: "cd762363c1c11ecb48611583520bba111f0034d4"
          });
        })
        .fail(function (error) {
          ok(false, error);
        })
        .always(function () {
          start();
        });
    });

  test("remote attachment creation", function () {
    stop();
    expect(3);

    var id,
      context = this,
      blob = new Blob([big_string]);

    context.jio.__storage._remote_sub_storage.post({"title": "bar"})
      .then(function (result) {
        id = result;
        return context.jio.__storage._remote_sub_storage
                      .putAttachment(id, "foo", blob);
      })
      .then(function () {
        return context.jio.repair();
      })
      .then(function (report) {
        deepEqual(report._list, [
          [report.LOG_PUT_LOCAL, id],
          [report.LOG_PUT_LOCAL_ATTACHMENT, id, 'foo']
        ]);
        return context.jio.getAttachment(
          id,
          "foo",
          {format: "text"}
        );
      })
      .then(function (result) {
        equal(result, big_string);
        return context.jio.__storage._signature_sub_storage
                      .getAttachment(id, "foo", {format: "json"});
      })
      .then(function (result) {
        deepEqual(result, {
          hash: "cd762363c1c11ecb48611583520bba111f0034d4"
        });
      })
      .fail(function (error) {
        ok(false, error);
      })
      .always(function () {
        start();
      });
  });

  test("remote attachment creation, remote document creation not checked",
       function () {
      stop();
      expect(7);

      var id,
        context = this,
        blob = new Blob([big_string]);

      this.jio = jIO.createJIO({
        type: "replicate",
        report_level: 1000,
        check_remote_creation: false,
        check_local_attachment_creation: true,
        local_sub_storage: {
          type: "uuid",
          sub_storage: {
            type: "memory"
          }
        },
        remote_sub_storage: {
          type: "uuid",
          sub_storage: {
            type: "memory"
          }
        }
      });

      context.jio.__storage._remote_sub_storage.post({"title": "foo"})
        .then(function (result) {
          id = result;
          return context.jio.__storage._remote_sub_storage
                        .putAttachment(id, "foo", blob);
        })
        .then(function () {
          return context.jio.repair();
        })
        .then(function (report) {
          deepEqual(report._list, [
            [report.LOG_SKIP_REMOTE_CREATION, id],
          ]);
          return context.jio.getAttachment(
            id,
            "foo",
            {format: "text"}
          );
        })
        .fail(function (error) {
          ok(error instanceof jIO.util.jIOError);
          equal(error.status_code, 404);
          equal(error.message, "Cannot find attachment: " + id + " , foo");
          return context.jio.__storage._signature_sub_storage
                        .getAttachment(id, "foo", {format: "json"});
        })
        .fail(function (error) {
          ok(error instanceof jIO.util.jIOError);
          equal(error.status_code, 404);
          var error_message = "Cannot find attachment: " +
            "_replicate_b9296354cdf1dbe0046de11f57a5a24f8f6a78a8 , " +
            "jio_attachment/";
          equal(
            error.message.substring(0, error_message.length),
            error_message
          );
        })
        .fail(function (error) {
          ok(false, error);
        })
        .always(function () {
          start();
        });
    });


  test("remote attachment creation not checked", function () {
    stop();
    expect(7);

    var id,
      context = this,
      blob = new Blob([big_string]);

    this.jio = jIO.createJIO({
      type: "replicate",
      report_level: 1000,
      check_remote_attachment_creation: false,
      check_remote_attachment_modification: true,
      local_sub_storage: {
        type: "uuid",
        sub_storage: {
          type: "memory"
        }
      },
      remote_sub_storage: {
        type: "uuid",
        sub_storage: {
          type: "memory"
        }
      }
    });

    context.jio.__storage._remote_sub_storage.post({"title": "foo"})
      .then(function (result) {
        id = result;
        return context.jio.__storage._remote_sub_storage
                      .putAttachment(id, "foo", blob);
      })
      .then(function () {
        return context.jio.repair();
      })
      .then(function (report) {
        deepEqual(report._list, [
          [report.LOG_PUT_LOCAL, id],
          [report.LOG_SKIP_REMOTE_ATTACHMENT_CREATION, id, 'foo']
        ]);
        return context.jio.getAttachment(
          id,
          "foo",
          {format: "text"}
        );
      })
      .fail(function (error) {
        ok(error instanceof jIO.util.jIOError);
        equal(error.status_code, 404);
        equal(error.message, "Cannot find attachment: " + id + " , foo");
        return context.jio.__storage._signature_sub_storage
                      .getAttachment(id, "foo", {format: "json"});
      })
      .fail(function (error) {
        ok(error instanceof jIO.util.jIOError);
        equal(error.status_code, 404);
        var error_message = "Cannot find attachment: " +
          "_replicate_b9296354cdf1dbe0046de11f57a5a24f8f6a78a8 , " +
          "jio_attachment/";
        equal(
          error.message.substring(0, error_message.length),
          error_message
        );
      })
      .fail(function (error) {
        ok(false, error);
      })
      .always(function () {
        start();
      });
  });

  test("local and remote attachment creations", function () {
    stop();
    expect(3);

    var context = this,
      id = 'foobar',
      blob = new Blob([big_string]),
      blob2 = new Blob([big_string + "a"]);

    context.jio.put(id, {"title": "foo"})
      .push(function () {
        return context.jio.repair();
      })
      .push(function () {
        return RSVP.all([
          context.jio.putAttachment(id, "conflict", blob),
          context.jio.__storage._remote_sub_storage.putAttachment(id,
                                                                  "conflict",
                                                                  blob2)
        ]);
      })
      .then(function () {
        return context.jio.repair();
      })
      .then(function () {
        ok(false);
      })
      .fail(function (report) {
        deepEqual(report._list, [
          [report.LOG_NO_CHANGE, id],
          [report.LOG_UNRESOLVED_ATTACHMENT_CONFLICT, id, 'conflict']
        ]);
      })
      .then(function () {
        return context.jio.__storage._signature_sub_storage.getAttachment(
          id,
          "conflict"
        );
      })
      .fail(function (error) {
        ok(error instanceof jIO.util.jIOError);
//        equal(error.message, "Cannot find document: conflict");
        equal(error.status_code, 404);
      })
      .always(function () {
        start();
      });
  });

  test("local and remote attachment creations: keep local", function () {
    stop();
    expect(4);

    var context = this,
      id = 'foobar',
      blob = new Blob([big_string]),
      blob2 = new Blob([big_string + "a"]);

    this.jio = jIO.createJIO({
      type: "replicate",
      report_level: 1000,
      conflict_handling: 1,
      check_local_attachment_creation: true,
      check_remote_attachment_creation: true,
      local_sub_storage: {
        type: "uuid",
        sub_storage: {
          type: "memory"
        }
      },
      remote_sub_storage: {
        type: "uuid",
        sub_storage: {
          type: "memory"
        }
      }
    });

    context.jio.put(id, {"title": "foo"})
      .push(function () {
        return context.jio.repair();
      })
      .push(function () {
        return RSVP.all([
          context.jio.putAttachment(id, "conflict", blob),
          context.jio.__storage._remote_sub_storage.putAttachment(id,
                                                                  "conflict",
                                                                  blob2)
        ]);
      })
      .then(function () {
        return context.jio.repair();
      })
      .then(function (report) {
        deepEqual(report._list, [
          [report.LOG_NO_CHANGE, id],
          [report.LOG_FORCE_PUT_REMOTE_ATTACHMENT, id, 'conflict']
        ]);
        return context.jio.getAttachment(
          id,
          "conflict",
          {format: "text"}
        );
      })
      .then(function (result) {
        equal(result, big_string);
        return context.jio.__storage._remote_sub_storage.getAttachment(
          id,
          "conflict",
          {format: "text"}
        );
      })
      .then(function (result) {
        equal(result, big_string);
        return context.jio.__storage._signature_sub_storage
                      .getAttachment(id, "conflict", {format: "json"});
      })
      .then(function (result) {
        deepEqual(result, {
          hash: "cd762363c1c11ecb48611583520bba111f0034d4"
        });
      })
      .fail(function (error) {
        ok(false, error);
      })
      .always(function () {
        start();
      });
  });

  test("local and remote attachment creations: keep local, " +
       "local not matching allAttachments", function () {
      stop();
      expect(4);

      var context = this,
        id = 'foobar',
        blob = new Blob([big_string]),
        blob2 = new Blob([big_string + "a"]);

      this.jio = jIO.createJIO({
        type: "replicate",
        report_level: 1000,
        conflict_handling: 1,
        check_local_attachment_creation: true,
        check_remote_attachment_creation: true,
        local_sub_storage: {
          type: "uuid",
          sub_storage: {
            type: "signaturestorageemptyallattachments",
            sub_storage: {
              type: "memory"
            }
          }
        },
        remote_sub_storage: {
          type: "uuid",
          sub_storage: {
            type: "memory"
          }
        },
        signature_sub_storage: {
          type: "uuid",
          sub_storage: {
            type: "query",
            sub_storage: {
              type: "memory"
            }
          }
        }
      });

      context.jio.put(id, {"title": "foo"})
        .push(function () {
          return context.jio.repair();
        })
        .push(function () {
          return RSVP.all([
            context.jio.putAttachment(id, "conflict", blob),
            context.jio.__storage._remote_sub_storage.putAttachment(id,
                                                                    "conflict",
                                                                    blob2)
          ]);
        })
        .then(function () {
          return context.jio.repair();
        })
         .then(function (report) {
          deepEqual(report._list, [
            [report.LOG_NO_CHANGE, id],
            [report.LOG_FORCE_PUT_REMOTE_ATTACHMENT, id, 'conflict']
          ]);
          return context.jio.getAttachment(
            id,
            "conflict",
            {format: "text"}
          );
        })
        .then(function (result) {
          equal(result, big_string);
          return context.jio.__storage._remote_sub_storage.getAttachment(
            id,
            "conflict",
            {format: "text"}
          );
        })
        .then(function (result) {
          equal(result, big_string);
          return context.jio.__storage._signature_sub_storage
                        .getAttachment(id, "conflict", {format: "json"});
        })
        .then(function (result) {
          deepEqual(result, {
            hash: "cd762363c1c11ecb48611583520bba111f0034d4"
          });
        })
        .fail(function (error) {
          ok(false, error);
        })
        .always(function () {
          start();
        });
    });

  test("local and remote attachment creations: keep local, " +
       "remote not matching allAttachments", function () {
      stop();
      expect(4);

      var context = this,
        id = 'foobar',
        blob = new Blob([big_string]),
        blob2 = new Blob([big_string + "a"]);

      this.jio = jIO.createJIO({
        type: "replicate",
        report_level: 1000,
        conflict_handling: 1,
        check_local_attachment_creation: true,
        check_remote_attachment_creation: true,
        local_sub_storage: {
          type: "uuid",
          sub_storage: {
            type: "memory"
          }
        },
        remote_sub_storage: {
          type: "uuid",
          sub_storage: {
            type: "signaturestorageemptyallattachments",
            sub_storage: {
              type: "memory"
            }
          }
        }
      });

      context.jio.put(id, {"title": "foo"})
        .push(function () {
          return context.jio.repair();
        })
        .push(function () {
          return RSVP.all([
            context.jio.putAttachment(id, "conflict", blob),
            context.jio.__storage._remote_sub_storage.putAttachment(id,
                                                                    "conflict",
                                                                    blob2)
          ]);
        })
        .then(function () {
          return context.jio.repair();
        })
         .then(function (report) {
          deepEqual(report._list, [
            [report.LOG_NO_CHANGE, id],
            [report.LOG_FORCE_PUT_REMOTE_ATTACHMENT, id, 'conflict']
          ]);
          return context.jio.getAttachment(
            id,
            "conflict",
            {format: "text"}
          );
        })
        .then(function (result) {
          equal(result, big_string);
          return context.jio.__storage._remote_sub_storage.getAttachment(
            id,
            "conflict",
            {format: "text"}
          );
        })
        .then(function (result) {
          equal(result, big_string);
          return context.jio.__storage._signature_sub_storage
                        .getAttachment(id, "conflict", {format: "json"});
        })
        .then(function (result) {
          deepEqual(result, {
            hash: "cd762363c1c11ecb48611583520bba111f0034d4"
          });
        })
        .fail(function (error) {
          ok(false, error);
        })
        .always(function () {
          start();
        });
    });

  test("local and remote attachment creations: keep remote", function () {
    stop();
    expect(4);

    var context = this,
      id = 'foobar',
      blob = new Blob([big_string]),
      blob2 = new Blob([big_string + "a"]);

    this.jio = jIO.createJIO({
      type: "replicate",
      report_level: 1000,
      conflict_handling: 2,
      check_local_attachment_creation: true,
      check_remote_attachment_creation: true,
      local_sub_storage: {
        type: "uuid",
        sub_storage: {
          type: "memory"
        }
      },
      remote_sub_storage: {
        type: "uuid",
        sub_storage: {
          type: "memory"
        }
      }
    });

    context.jio.put(id, {"title": "foo"})
      .push(function () {
        return context.jio.repair();
      })
      .push(function () {
        return RSVP.all([
          context.jio.putAttachment(id, "conflict", blob),
          context.jio.__storage._remote_sub_storage.putAttachment(id,
                                                                  "conflict",
                                                                  blob2)
        ]);
      })
      .then(function () {
        return context.jio.repair();
      })
      .then(function (report) {
        deepEqual(report._list, [
          [report.LOG_NO_CHANGE, id],
          [report.LOG_FORCE_PUT_LOCAL_ATTACHMENT, id, 'conflict']
        ]);
        return context.jio.getAttachment(
          id,
          "conflict",
          {format: "text"}
        );
      })
      .then(function (result) {
        equal(result, big_string + "a");
        return context.jio.__storage._remote_sub_storage.getAttachment(
          id,
          "conflict",
          {format: "text"}
        );
      })
      .then(function (result) {
        equal(result, big_string + "a");
        return context.jio.__storage._signature_sub_storage
                      .getAttachment(id, "conflict", {format: "json"});
      })
      .then(function (result) {
        deepEqual(result, {
          hash: "65cf771ad2cc0b1e8f89361e3b7bec2365b3ad24"
        });
      })
      .fail(function (error) {
        ok(false, error);
      })
      .always(function () {
        start();
      });
  });

  test("local and remote attachment creations: keep remote, " +
       "local not matching allAttachments", function () {
      stop();
      expect(4);

      var context = this,
        id = 'foobar',
        blob = new Blob([big_string]),
        blob2 = new Blob([big_string + "a"]);

      this.jio = jIO.createJIO({
        type: "replicate",
        report_level: 1000,
        conflict_handling: 2,
        check_local_attachment_creation: true,
        check_remote_attachment_creation: true,
        local_sub_storage: {
          type: "uuid",
          sub_storage: {
            type: "signaturestorageemptyallattachments",
            sub_storage: {
              type: "memory"
            }
          }
        },
        remote_sub_storage: {
          type: "uuid",
          sub_storage: {
            type: "memory"
          }
        },
        signature_sub_storage: {
          type: "uuid",
          sub_storage: {
            type: "query",
            sub_storage: {
              type: "memory"
            }
          }
        }
      });

      context.jio.put(id, {"title": "foo"})
        .push(function () {
          return context.jio.repair();
        })
        .push(function () {
          return RSVP.all([
            context.jio.putAttachment(id, "conflict", blob),
            context.jio.__storage._remote_sub_storage.putAttachment(id,
                                                                    "conflict",
                                                                    blob2)
          ]);
        })
        .then(function () {
          return context.jio.repair();
        })
         .then(function (report) {
          deepEqual(report._list, [
            [report.LOG_NO_CHANGE, id],
            [report.LOG_FORCE_PUT_LOCAL_ATTACHMENT, id, 'conflict']
          ]);
          return context.jio.getAttachment(
            id,
            "conflict",
            {format: "text"}
          );
        })
        .then(function (result) {
          equal(result, big_string + "a");
          return context.jio.__storage._remote_sub_storage.getAttachment(
            id,
            "conflict",
            {format: "text"}
          );
        })
        .then(function (result) {
          equal(result, big_string + "a");
          return context.jio.__storage._signature_sub_storage
                        .getAttachment(id, "conflict", {format: "json"});
        })
        .then(function (result) {
          deepEqual(result, {
            hash: "65cf771ad2cc0b1e8f89361e3b7bec2365b3ad24"
          });
        })
        .fail(function (error) {
          ok(false, error);
        })
        .always(function () {
          start();
        });
    });

  test("local and remote attachment creations: keep remote, " +
       "remote not matching allAttachments", function () {
      stop();
      expect(4);

      var context = this,
        id = 'foobar',
        blob = new Blob([big_string]),
        blob2 = new Blob([big_string + "a"]);

      this.jio = jIO.createJIO({
        type: "replicate",
        report_level: 1000,
        conflict_handling: 2,
        check_local_attachment_creation: true,
        check_remote_attachment_creation: true,
        local_sub_storage: {
          type: "uuid",
          sub_storage: {
            type: "memory"
          }
        },
        remote_sub_storage: {
          type: "uuid",
          sub_storage: {
            type: "signaturestorageemptyallattachments",
            sub_storage: {
              type: "memory"
            }
          }
        }
      });

      context.jio.put(id, {"title": "foo"})
        .push(function () {
          return context.jio.repair();
        })
        .push(function () {
          return RSVP.all([
            context.jio.putAttachment(id, "conflict", blob),
            context.jio.__storage._remote_sub_storage.putAttachment(id,
                                                                    "conflict",
                                                                    blob2)
          ]);
        })
        .then(function () {
          return context.jio.repair();
        })
         .then(function (report) {
          deepEqual(report._list, [
            [report.LOG_NO_CHANGE, id],
            [report.LOG_FORCE_PUT_LOCAL_ATTACHMENT, id, 'conflict']
          ]);
          return context.jio.getAttachment(
            id,
            "conflict",
            {format: "text"}
          );
        })
        .then(function (result) {
          equal(result, big_string + "a");
          return context.jio.__storage._remote_sub_storage.getAttachment(
            id,
            "conflict",
            {format: "text"}
          );
        })
        .then(function (result) {
          equal(result, big_string + "a");
          return context.jio.__storage._signature_sub_storage
                        .getAttachment(id, "conflict", {format: "json"});
        })
        .then(function (result) {
          deepEqual(result, {
            hash: "65cf771ad2cc0b1e8f89361e3b7bec2365b3ad24"
          });
        })
        .fail(function (error) {
          ok(false, error);
        })
        .always(function () {
          start();
        });
    });

  test("local and remote attachment creations: continue", function () {
    stop();
    expect(5);

    var context = this,
      id = 'foobar',
      blob = new Blob([big_string]),
      blob2 = new Blob([big_string + "a"]);

    this.jio = jIO.createJIO({
      type: "replicate",
      report_level: 1000,
      conflict_handling: 3,
      check_local_attachment_creation: true,
      check_remote_attachment_creation: true,
      local_sub_storage: {
        type: "uuid",
        sub_storage: {
          type: "memory"
        }
      },
      remote_sub_storage: {
        type: "uuid",
        sub_storage: {
          type: "memory"
        }
      }
    });

    context.jio.put(id, {"title": "foo"})
      .push(function () {
        return context.jio.repair();
      })
      .push(function () {
        return RSVP.all([
          context.jio.putAttachment(id, "conflict", blob),
          context.jio.__storage._remote_sub_storage.putAttachment(id,
                                                                  "conflict",
                                                                  blob2)
        ]);
      })
      .then(function () {
        return context.jio.repair();
      })
      .then(function (report) {
        deepEqual(report._list, [
          [report.LOG_NO_CHANGE, id],
          [report.LOG_SKIP_CONFLICT_ATTACHMENT, id, 'conflict']
        ]);
        return context.jio.getAttachment(
          id,
          "conflict",
          {format: "text"}
        );
      })
      .then(function (result) {
        equal(result, big_string);
        return context.jio.__storage._remote_sub_storage.getAttachment(
          id,
          "conflict",
          {format: "text"}
        );
      })
      .then(function (result) {
        equal(result, big_string + "a");
        return context.jio.__storage._signature_sub_storage
                      .getAttachment(id, "conflict", {format: "json"});
      })
      .fail(function (error) {
        ok(error instanceof jIO.util.jIOError);
//        equal(error.message, "Cannot find document: conflict");
        equal(error.status_code, 404);
      })
      .fail(function (error) {
        ok(false, error);
      })
      .always(function () {
        start();
      });
  });

  test("local and remote same attachment creations", function () {
    stop();
    expect(4);

    var context = this,
      id = 'foobar',
      blob = new Blob([big_string]),
      blob2 = new Blob([big_string]);

    context.jio.put(id, {"title": "foo"})
      .push(function () {
        return context.jio.repair();
      })
      .push(function () {
        return RSVP.all([
          context.jio.putAttachment(id, "conflict", blob),
          context.jio.__storage._remote_sub_storage.putAttachment(id,
                                                                  "conflict",
                                                                  blob2)
        ]);
      })
      .then(function () {
        return context.jio.repair();
      })
      .then(function (report) {
        deepEqual(report._list, [
          [report.LOG_NO_CHANGE, id],
          [report.LOG_FALSE_CONFLICT_ATTACHMENT, id, 'conflict']
        ]);
        return context.jio.getAttachment(
          id,
          "conflict",
          {format: "text"}
        );
      })
      .then(function (result) {
        equal(result, big_string);
        return context.jio.__storage._remote_sub_storage.getAttachment(
          id,
          "conflict",
          {format: "text"}
        );
      })
      .then(function (result) {
        equal(result, big_string);
        return context.jio.__storage._signature_sub_storage
                      .getAttachment(id, "conflict", {format: "json"});
      })
      .then(function (result) {
        deepEqual(result, {
          hash: "cd762363c1c11ecb48611583520bba111f0034d4"
        });
      })
      .fail(function (error) {
        ok(false, error);
      })
      .always(function () {
        start();
      });
  });

  test("no attachment modification", function () {
    stop();
    expect(4);

    var context = this,
      id = 'foobar',
      blob = new Blob([big_string]);

    context.jio.put(id, {"title": "foo"})
      .push(function () {
        return context.jio.repair();
      })
      .push(function () {
        return context.jio.putAttachment(id, "conflict", blob);
      })
      .then(function () {
        return context.jio.repair();
      })
      .then(function () {
        return context.jio.repair();
      })
      .then(function (report) {
        deepEqual(report._list, [
          [report.LOG_NO_CHANGE, id],
          [report.LOG_NO_CHANGE_ATTACHMENT, id, 'conflict']
        ]);
        return context.jio.getAttachment(
          id,
          "conflict",
          {format: "text"}
        );
      })
      .then(function (result) {
        equal(result, big_string);
        return context.jio.__storage._remote_sub_storage.getAttachment(
          id,
          "conflict",
          {format: "text"}
        );
      })
      .then(function (result) {
        equal(result, big_string);
        return context.jio.__storage._signature_sub_storage
                      .getAttachment(id, "conflict", {format: "json"});
      })
      .then(function (result) {
        deepEqual(result, {
          hash: "cd762363c1c11ecb48611583520bba111f0034d4"
        });
      })
      .fail(function (error) {
        ok(false, error);
      })
      .always(function () {
        start();
      });
  });

  test("local attachment modification", function () {
    stop();
    expect(4);

    var context = this,
      id = 'foobar',
      blob = new Blob([big_string]),
      blob2 = new Blob([big_string + "a"]);

    context.jio.put(id, {"title": "foo"})
      .push(function () {
        return context.jio.repair();
      })
      .push(function () {
        return context.jio.putAttachment(id, "conflict", blob);
      })
      .push(function () {
        return context.jio.repair();
      })
      .push(function () {
        return context.jio.putAttachment(id, "conflict", blob2);
      })
      .then(function () {
        return context.jio.repair();
      })
      .then(function (report) {
        deepEqual(report._list, [
          [report.LOG_NO_CHANGE, id],
          [report.LOG_PUT_REMOTE_ATTACHMENT, id, 'conflict']
        ]);
        return context.jio.getAttachment(
          id,
          "conflict",
          {format: "text"}
        );
      })
      .then(function (result) {
        equal(result, big_string + "a");
        return context.jio.__storage._remote_sub_storage.getAttachment(
          id,
          "conflict",
          {format: "text"}
        );
      })
      .then(function (result) {
        equal(result, big_string + "a");
        return context.jio.__storage._signature_sub_storage
                      .getAttachment(id, "conflict", {format: "json"});
      })
      .then(function (result) {
        deepEqual(result, {
          hash: "65cf771ad2cc0b1e8f89361e3b7bec2365b3ad24"
        });
      })
      .fail(function (error) {
        ok(false, error);
      })
      .always(function () {
        start();
      });
  });

  test("local attachment modification not checked", function () {
    stop();
    expect(4);

    var context = this,
      id = 'foobar',
      blob = new Blob([big_string]),
      blob2 = new Blob([big_string + "a"]);

    this.jio = jIO.createJIO({
      type: "replicate",
      report_level: 1000,
      check_local_attachment_creation: true,
      check_local_attachment_modification: false,
      local_sub_storage: {
        type: "uuid",
        sub_storage: {
          type: "memory"
        }
      },
      remote_sub_storage: {
        type: "uuid",
        sub_storage: {
          type: "memory"
        }
      }
    });

    context.jio.put(id, {"title": "foo"})
      .push(function () {
        return context.jio.repair();
      })
      .push(function () {
        return context.jio.putAttachment(id, "conflict", blob);
      })
      .push(function () {
        return context.jio.repair();
      })
      .push(function () {
        return context.jio.putAttachment(id, "conflict", blob2);
      })
      .then(function () {
        return context.jio.repair();
      })
      .then(function (report) {
        deepEqual(report._list, [
          [report.LOG_NO_CHANGE, id],
          [report.LOG_SKIP_LOCAL_ATTACHMENT_MODIFICATION, id, 'conflict']
        ]);
        return context.jio.getAttachment(
          id,
          "conflict",
          {format: "text"}
        );
      })
      .then(function (result) {
        equal(result, big_string + "a");
        return context.jio.__storage._remote_sub_storage.getAttachment(
          id,
          "conflict",
          {format: "text"}
        );
      })
      .then(function (result) {
        equal(result, big_string);
        return context.jio.__storage._signature_sub_storage
                      .getAttachment(id, "conflict", {format: "json"});
      })
      .then(function (result) {
        deepEqual(result, {
          hash: "cd762363c1c11ecb48611583520bba111f0034d4"
        });
      })
      .fail(function (error) {
        ok(false, error);
      })
      .always(function () {
        start();
      });
  });

  test("remote attachment modification", function () {
    stop();
    expect(4);

    var context = this,
      id = 'foobar',
      blob = new Blob([big_string]),
      blob2 = new Blob([big_string + "a"]);

    context.jio.put(id, {"title": "foo"})
      .push(function () {
        return context.jio.repair();
      })
      .push(function () {
        return context.jio.putAttachment(id, "conflict", blob);
      })
      .push(function () {
        return context.jio.repair();
      })
      .push(function () {
        return context.jio.__storage._remote_sub_storage
                          .putAttachment(id, "conflict", blob2);
      })
      .then(function () {
        return context.jio.repair();
      })
      .then(function (report) {
        deepEqual(report._list, [
          [report.LOG_NO_CHANGE, id],
          [report.LOG_PUT_LOCAL_ATTACHMENT, id, 'conflict']
        ]);
        return context.jio.getAttachment(
          id,
          "conflict",
          {format: "text"}
        );
      })
      .then(function (result) {
        equal(result, big_string + "a");
        return context.jio.__storage._remote_sub_storage.getAttachment(
          id,
          "conflict",
          {format: "text"}
        );
      })
      .then(function (result) {
        equal(result, big_string + "a");
        return context.jio.__storage._signature_sub_storage
                      .getAttachment(id, "conflict", {format: "json"});
      })
      .then(function (result) {
        deepEqual(result, {
          hash: "65cf771ad2cc0b1e8f89361e3b7bec2365b3ad24"
        });
      })
      .fail(function (error) {
        ok(false, error);
      })
      .always(function () {
        start();
      });
  });

  test("remote attachment modification not checked", function () {
    stop();
    expect(4);

    var context = this,
      id = 'foobar',
      blob = new Blob([big_string]),
      blob2 = new Blob([big_string + "a"]);

    this.jio = jIO.createJIO({
      type: "replicate",
      report_level: 1000,
      check_local_attachment_creation: true,
      check_local_attachment_modification: true,
      check_remote_attachment_modification: false,
      check_remote_attachment_creation: true,
      local_sub_storage: {
        type: "uuid",
        sub_storage: {
          type: "memory"
        }
      },
      remote_sub_storage: {
        type: "uuid",
        sub_storage: {
          type: "memory"
        }
      }
    });

    context.jio.put(id, {"title": "foo"})
      .push(function () {
        return context.jio.repair();
      })
      .push(function () {
        return context.jio.putAttachment(id, "conflict", blob);
      })
      .push(function () {
        return context.jio.repair();
      })
      .push(function () {
        return context.jio.__storage._remote_sub_storage
                      .putAttachment(id, "conflict", blob2);
      })
      .then(function () {
        return context.jio.repair();
      })
      .then(function (report) {
        deepEqual(report._list, [
          [report.LOG_NO_CHANGE, id],
          [report.LOG_SKIP_REMOTE_ATTACHMENT_MODIFICATION, id, 'conflict']
        ]);
        return context.jio.getAttachment(
          id,
          "conflict",
          {format: "text"}
        );
      })
      .then(function (result) {
        equal(result, big_string);
        return context.jio.__storage._remote_sub_storage.getAttachment(
          id,
          "conflict",
          {format: "text"}
        );
      })
      .then(function (result) {
        equal(result, big_string + "a");
        return context.jio.__storage._signature_sub_storage
                      .getAttachment(id, "conflict", {format: "json"});
      })
      .then(function (result) {
        deepEqual(result, {
          hash: "cd762363c1c11ecb48611583520bba111f0034d4"
        });
      })
      .fail(function (error) {
        ok(false, error);
      })
      .always(function () {
        start();
      });
  });

  test("local and remote attachment modifications", function () {
    stop();
    expect(4);

    var context = this,
      id = 'foobar',
      blob = new Blob([big_string]),
      blob2 = new Blob([big_string + "a"]),
      blob3 = new Blob([big_string + "b"]);

    context.jio.put(id, {"title": "foo"})
      .push(function () {
        return context.jio.repair();
      })
      .push(function () {
        return context.jio.putAttachment(id, "conflict", blob);
      })
      .push(function () {
        return context.jio.repair();
      })
      .push(function () {
        return RSVP.all([
          context.jio.putAttachment(id, "conflict", blob2),
          context.jio.__storage._remote_sub_storage
                     .putAttachment(id, "conflict", blob3)
        ]);
      })
      .then(function () {
        return context.jio.repair();
      })
      .then(function () {
        ok(false);
      })
      .fail(function (report) {
        deepEqual(report._list, [
          [report.LOG_NO_CHANGE, id],
          [report.LOG_UNRESOLVED_ATTACHMENT_CONFLICT, id, 'conflict']
        ]);
      })
      .then(function () {
        return context.jio.getAttachment(
          id,
          "conflict",
          {format: "text"}
        );
      })
      .then(function (result) {
        equal(result, big_string + "a");
        return context.jio.__storage._remote_sub_storage.getAttachment(
          id,
          "conflict",
          {format: "text"}
        );
      })
      .then(function (result) {
        equal(result, big_string + "b");
        return context.jio.__storage._signature_sub_storage
                      .getAttachment(id, "conflict", {format: "json"});
      })
      .then(function (result) {
        deepEqual(result, {
          hash: "cd762363c1c11ecb48611583520bba111f0034d4"
        });
      })
      .fail(function (error) {
        ok(false, error);
      })
      .always(function () {
        start();
      });
  });

  test("local and remote attachment modifications: keep local", function () {
    stop();
    expect(4);

    var context = this,
      id = 'foobar',
      blob = new Blob([big_string]),
      blob2 = new Blob([big_string + "a"]),
      blob3 = new Blob([big_string + "b"]);

    this.jio = jIO.createJIO({
      type: "replicate",
      report_level: 1000,
      conflict_handling: 1,
      check_local_attachment_creation: true,
      check_remote_attachment_creation: true,
      check_local_attachment_modification: true,
      check_remote_attachment_modification: true,
      local_sub_storage: {
        type: "uuid",
        sub_storage: {
          type: "memory"
        }
      },
      remote_sub_storage: {
        type: "uuid",
        sub_storage: {
          type: "memory"
        }
      }
    });

    context.jio.put(id, {"title": "foo"})
      .push(function () {
        return context.jio.repair();
      })
      .push(function () {
        return context.jio.putAttachment(id, "conflict", blob);
      })
      .push(function () {
        return context.jio.repair();
      })
      .push(function () {
        return RSVP.all([
          context.jio.putAttachment(id, "conflict", blob2),
          context.jio.__storage._remote_sub_storage
                     .putAttachment(id, "conflict", blob3)
        ]);
      })
      .then(function () {
        return context.jio.repair();
      })
      .then(function (report) {
        deepEqual(report._list, [
          [report.LOG_NO_CHANGE, id],
          [report.LOG_FORCE_PUT_REMOTE_ATTACHMENT, id, 'conflict']
        ]);
        return context.jio.getAttachment(
          id,
          "conflict",
          {format: "text"}
        );
      })
      .then(function (result) {
        equal(result, big_string + "a");
        return context.jio.__storage._remote_sub_storage.getAttachment(
          id,
          "conflict",
          {format: "text"}
        );
      })
      .then(function (result) {
        equal(result, big_string + "a");
        return context.jio.__storage._signature_sub_storage
                      .getAttachment(id, "conflict", {format: "json"});
      })
      .then(function (result) {
        deepEqual(result, {
          hash: "65cf771ad2cc0b1e8f89361e3b7bec2365b3ad24"
        });
      })
      .fail(function (error) {
        ok(false, error);
      })
      .always(function () {
        start();
      });
  });

  test("local and remote attachment modifications: keep remote", function () {
    stop();
    expect(4);

    var context = this,
      id = 'foobar',
      blob = new Blob([big_string]),
      blob2 = new Blob([big_string + "a"]),
      blob3 = new Blob([big_string + "b"]);

    this.jio = jIO.createJIO({
      type: "replicate",
      report_level: 1000,
      conflict_handling: 2,
      check_local_attachment_creation: true,
      check_remote_attachment_creation: true,
      check_local_attachment_modification: true,
      check_remote_attachment_modification: true,
      local_sub_storage: {
        type: "uuid",
        sub_storage: {
          type: "memory"
        }
      },
      remote_sub_storage: {
        type: "uuid",
        sub_storage: {
          type: "memory"
        }
      }
    });

    context.jio.put(id, {"title": "foo"})
      .push(function () {
        return context.jio.repair();
      })
      .push(function () {
        return context.jio.putAttachment(id, "conflict", blob);
      })
      .push(function () {
        return context.jio.repair();
      })
      .push(function () {
        return RSVP.all([
          context.jio.putAttachment(id, "conflict", blob2),
          context.jio.__storage._remote_sub_storage
                     .putAttachment(id, "conflict", blob3)
        ]);
      })
      .then(function () {
        return context.jio.repair();
      })
      .then(function (report) {
        deepEqual(report._list, [
          [report.LOG_NO_CHANGE, id],
          [report.LOG_FORCE_PUT_LOCAL_ATTACHMENT, id, 'conflict']
        ]);
        return context.jio.getAttachment(
          id,
          "conflict",
          {format: "text"}
        );
      })
      .then(function (result) {
        equal(result, big_string + "b");
        return context.jio.__storage._remote_sub_storage.getAttachment(
          id,
          "conflict",
          {format: "text"}
        );
      })
      .then(function (result) {
        equal(result, big_string + "b");
        return context.jio.__storage._signature_sub_storage
                      .getAttachment(id, "conflict", {format: "json"});
      })
      .then(function (result) {
        deepEqual(result, {
          hash: "9a73ce4f16b7fa5d2b4d8f723a754fef048fb9f8"
        });
      })
      .fail(function (error) {
        ok(false, error);
      })
      .always(function () {
        start();
      });
  });

  test("local and remote attachment modifications: continue", function () {
    stop();
    expect(4);

    var context = this,
      id = 'foobar',
      blob = new Blob([big_string]),
      blob2 = new Blob([big_string + "a"]),
      blob3 = new Blob([big_string + "b"]);

    this.jio = jIO.createJIO({
      type: "replicate",
      report_level: 1000,
      conflict_handling: 3,
      check_local_attachment_creation: true,
      check_remote_attachment_creation: true,
      check_local_attachment_modification: true,
      check_remote_attachment_modification: true,
      local_sub_storage: {
        type: "uuid",
        sub_storage: {
          type: "memory"
        }
      },
      remote_sub_storage: {
        type: "uuid",
        sub_storage: {
          type: "memory"
        }
      }
    });

    context.jio.put(id, {"title": "foo"})
      .push(function () {
        return context.jio.repair();
      })
      .push(function () {
        return context.jio.putAttachment(id, "conflict", blob);
      })
      .push(function () {
        return context.jio.repair();
      })
      .push(function () {
        return RSVP.all([
          context.jio.putAttachment(id, "conflict", blob2),
          context.jio.__storage._remote_sub_storage
                     .putAttachment(id, "conflict", blob3)
        ]);
      })
      .then(function () {
        return context.jio.repair();
      })
      .then(function (report) {
        deepEqual(report._list, [
          [report.LOG_NO_CHANGE, id],
          [report.LOG_SKIP_CONFLICT_ATTACHMENT, id, 'conflict']
        ]);
        return context.jio.getAttachment(
          id,
          "conflict",
          {format: "text"}
        );
      })
      .then(function (result) {
        equal(result, big_string + "a");
        return context.jio.__storage._remote_sub_storage.getAttachment(
          id,
          "conflict",
          {format: "text"}
        );
      })
      .then(function (result) {
        equal(result, big_string + "b");
        return context.jio.__storage._signature_sub_storage
                      .getAttachment(id, "conflict", {format: "json"});
      })
      .then(function (result) {
        deepEqual(result, {
          hash: "cd762363c1c11ecb48611583520bba111f0034d4"
        });
      })
      .fail(function (error) {
        ok(false, error);
      })
      .always(function () {
        start();
      });
  });

  test("local and remote attachment same modifications", function () {
    stop();
    expect(4);

    var context = this,
      id = 'foobar',
      blob = new Blob([big_string]),
      blob2 = new Blob([big_string + "a"]);

    context.jio.put(id, {"title": "foo"})
      .push(function () {
        return context.jio.repair();
      })
      .push(function () {
        return context.jio.putAttachment(id, "conflict", blob);
      })
      .push(function () {
        return context.jio.repair();
      })
      .push(function () {
        return RSVP.all([
          context.jio.putAttachment(id, "conflict", blob2),
          context.jio.__storage._remote_sub_storage
                     .putAttachment(id, "conflict", blob2)
        ]);
      })
      .then(function () {
        return context.jio.repair();
      })
      .then(function (report) {
        deepEqual(report._list, [
          [report.LOG_NO_CHANGE, id],
          [report.LOG_FALSE_CONFLICT_ATTACHMENT, id, 'conflict']
        ]);
        return context.jio.getAttachment(
          id,
          "conflict",
          {format: "text"}
        );
      })
      .then(function (result) {
        equal(result, big_string + "a");
        return context.jio.__storage._remote_sub_storage.getAttachment(
          id,
          "conflict",
          {format: "text"}
        );
      })
      .then(function (result) {
        equal(result, big_string + "a");
        return context.jio.__storage._signature_sub_storage
                      .getAttachment(id, "conflict", {format: "json"});
      })
      .then(function (result) {
        deepEqual(result, {
          hash: "65cf771ad2cc0b1e8f89361e3b7bec2365b3ad24"
        });
      })
      .fail(function (error) {
        ok(false, error);
      })
      .always(function () {
        start();
      });
  });

  test("local attachment deletion", function () {
    stop();
    expect(10);

    var id,
      context = this,
      blob = new Blob([big_string]);

    context.jio.post({"title": "foo"})
      .then(function (result) {
        id = result;
        return context.jio.putAttachment(id, "foo", blob);
      })
      .then(function () {
        return context.jio.repair();
      })
      .then(function () {
        return context.jio.removeAttachment(id, "foo");
      })
      .then(function () {
        return context.jio.repair();
      })
      .then(function (report) {
        deepEqual(report._list, [
          [report.LOG_NO_CHANGE, id],
          [report.LOG_DELETE_REMOTE_ATTACHMENT, id, 'foo']
        ]);
        return context.jio.getAttachment(
          id,
          "foo",
          {format: "text"}
        );
      })
      .fail(function (error) {
        ok(error instanceof jIO.util.jIOError);
        equal(error.status_code, 404);
        equal(error.message, "Cannot find attachment: " + id + " , foo");
        return context.jio.__storage._remote_sub_storage.getAttachment(
          id,
          "foo",
          {format: "text"}
        );
      })
      .fail(function (error) {
        ok(error instanceof jIO.util.jIOError);
        equal(error.status_code, 404);
        equal(error.message, "Cannot find attachment: " + id + " , foo");
        return context.jio.__storage._signature_sub_storage
                      .getAttachment(id, "foo", {format: "json"});
      })
      .fail(function (error) {
        ok(error instanceof jIO.util.jIOError);
        equal(error.status_code, 404);
        var error_message = "Cannot find attachment: " +
          "_replicate_b9296354cdf1dbe0046de11f57a5a24f8f6a78a8 , " +
          "jio_attachment/";
        equal(
          error.message.substring(0, error_message.length),
          error_message
        );
      })
      .fail(function (error) {
        ok(false, error);
      })
      .always(function () {
        start();
      });
  });

  test("local attachment deletion not checked", function () {

    stop();
    expect(6);

    var id,
      context = this,
      blob = new Blob([big_string]);

    this.jio = jIO.createJIO({
      type: "replicate",
      report_level: 1000,
      check_local_attachment_creation: true,
      check_local_attachment_deletion: false,
      check_local_attachment_modification: true,
      check_remote_attachment_creation: true,
      check_remote_attachment_deletion: true,
      check_remote_attachment_modification: true,
      local_sub_storage: {
        type: "uuid",
        sub_storage: {
          type: "memory"
        }
      },
      remote_sub_storage: {
        type: "uuid",
        sub_storage: {
          type: "memory"
        }
      }
    });

    context.jio.post({"title": "foo"})
      .then(function (result) {
        id = result;
        return context.jio.putAttachment(id, "foo", blob);
      })
      .then(function () {
        return context.jio.repair();
      })
      .then(function () {
        return context.jio.removeAttachment(id, "foo");
      })
      .then(function () {
        return context.jio.repair();
      })
      .then(function (report) {
        deepEqual(report._list, [
          [report.LOG_NO_CHANGE, id],
          [report.LOG_SKIP_LOCAL_ATTACHMENT_DELETION, id, 'foo'],
          [report.LOG_NO_CHANGE_ATTACHMENT, id, 'foo']
        ]);
        return context.jio.getAttachment(
          id,
          "foo",
          {format: "text"}
        );
      })
      .fail(function (error) {
        ok(error instanceof jIO.util.jIOError);
        equal(error.status_code, 404);
        equal(error.message, "Cannot find attachment: " + id + " , foo");
        return context.jio.__storage._remote_sub_storage.getAttachment(
          id,
          "foo",
          {format: "text"}
        );
      })
      .then(function (result) {
        equal(result, big_string);
        return context.jio.__storage._signature_sub_storage
                      .getAttachment(id, "foo", {format: "json"});
      })
      .then(function (result) {
        deepEqual(result, {
          hash: "cd762363c1c11ecb48611583520bba111f0034d4"
        });
      })
      .fail(function (error) {
        ok(false, error);
      })
      .always(function () {
        start();
      });
  });

  test("remote attachment deletion", function () {
    stop();
    expect(10);

    var id,
      context = this,
      blob = new Blob([big_string]);

    context.jio.post({"title": "foo"})
      .then(function (result) {
        id = result;
        return context.jio.putAttachment(id, "foo", blob);
      })
      .then(function () {
        return context.jio.repair();
      })
      .then(function () {
        return context.jio.__storage._remote_sub_storage
                      .removeAttachment(id, "foo");
      })
      .then(function () {
        return context.jio.repair();
      })
      .then(function (report) {
        deepEqual(report._list, [
          [report.LOG_NO_CHANGE, id],
          [report.LOG_DELETE_LOCAL_ATTACHMENT, id, 'foo']
        ]);
        return context.jio.getAttachment(
          id,
          "foo",
          {format: "text"}
        );
      })
      .fail(function (error) {
        ok(error instanceof jIO.util.jIOError);
        equal(error.status_code, 404);
        equal(error.message, "Cannot find attachment: " + id + " , foo");
        return context.jio.__storage._remote_sub_storage.getAttachment(
          id,
          "foo",
          {format: "text"}
        );
      })
      .fail(function (error) {
        ok(error instanceof jIO.util.jIOError);
        equal(error.status_code, 404);
        equal(error.message, "Cannot find attachment: " + id + " , foo");
        return context.jio.__storage._signature_sub_storage
                      .getAttachment(id, "foo", {format: "json"});
      })
      .fail(function (error) {
        ok(error instanceof jIO.util.jIOError);
        equal(error.status_code, 404);
        var error_message = "Cannot find attachment: " +
          "_replicate_b9296354cdf1dbe0046de11f57a5a24f8f6a78a8 , " +
          "jio_attachment/";
        equal(
          error.message.substring(0, error_message.length),
          error_message
        );
      })
      .fail(function (error) {
        ok(false, error);
      })
      .always(function () {
        start();
      });
  });

  test("remote attachment deletion not checked", function () {

    stop();
    expect(6);

    var id,
      context = this,
      blob = new Blob([big_string]);

    this.jio = jIO.createJIO({
      type: "replicate",
      report_level: 1000,
      check_local_attachment_creation: true,
      check_local_attachment_deletion: true,
      check_local_attachment_modification: true,
      check_remote_attachment_creation: true,
      check_remote_attachment_deletion: false,
      check_remote_attachment_modification: true,
      local_sub_storage: {
        type: "uuid",
        sub_storage: {
          type: "memory"
        }
      },
      remote_sub_storage: {
        type: "uuid",
        sub_storage: {
          type: "memory"
        }
      }
    });

    context.jio.post({"title": "foo"})
      .then(function (result) {
        id = result;
        return context.jio.putAttachment(id, "foo", blob);
      })
      .then(function () {
        return context.jio.repair();
      })
      .then(function () {
        return context.jio.__storage._remote_sub_storage
                      .removeAttachment(id, "foo");
      })
      .then(function () {
        return context.jio.repair();
      })
      .then(function (report) {
        deepEqual(report._list, [
          [report.LOG_NO_CHANGE, id],
          [report.LOG_SKIP_REMOTE_ATTACHMENT_DELETION, id, 'foo']
        ]);
        return context.jio.__storage._remote_sub_storage.getAttachment(
          id,
          "foo",
          {format: "text"}
        );
      })
      .fail(function (error) {
        ok(error instanceof jIO.util.jIOError);
        equal(error.status_code, 404);
        equal(error.message, "Cannot find attachment: " + id + " , foo");
        return context.jio.getAttachment(
          id,
          "foo",
          {format: "text"}
        );
      })
      .then(function (result) {
        equal(result, big_string);
        return context.jio.__storage._signature_sub_storage
                      .getAttachment(id, "foo", {format: "json"});
      })
      .then(function (result) {
        deepEqual(result, {
          hash: "cd762363c1c11ecb48611583520bba111f0034d4"
        });
      })
      .fail(function (error) {
        ok(false, error);
      })
      .always(function () {
        start();
      });
  });

  test("local and remote attachment deletions", function () {
    stop();
    expect(10);

    var id,
      context = this,
      blob = new Blob([big_string]);

    context.jio.post({"title": "foo"})
      .then(function (result) {
        id = result;
        return context.jio.putAttachment(id, "foo", blob);
      })
      .then(function () {
        return context.jio.repair();
      })
      .then(function () {
        return RSVP.all([
          context.jio.removeAttachment(id, "foo"),
          context.jio.__storage._remote_sub_storage
                     .removeAttachment(id, "foo")
        ]);
      })
      .then(function () {
        return context.jio.repair();
      })
      .then(function (report) {
        deepEqual(report._list, [
          [report.LOG_NO_CHANGE, id],
          [report.LOG_FALSE_CONFLICT_ATTACHMENT, id, 'foo']
        ]);
        return context.jio.getAttachment(
          id,
          "foo",
          {format: "text"}
        );
      })
      .fail(function (error) {
        ok(error instanceof jIO.util.jIOError);
        equal(error.status_code, 404);
        equal(error.message, "Cannot find attachment: " + id + " , foo");
        return context.jio.__storage._remote_sub_storage.getAttachment(
          id,
          "foo",
          {format: "text"}
        );
      })
      .fail(function (error) {
        ok(error instanceof jIO.util.jIOError);
        equal(error.status_code, 404);
        equal(error.message, "Cannot find attachment: " + id + " , foo");
        return context.jio.__storage._signature_sub_storage
                      .getAttachment(id, "foo", {format: "json"});
      })
      .fail(function (error) {
        ok(error instanceof jIO.util.jIOError);
        equal(error.status_code, 404);
        var error_message = "Cannot find attachment: " +
          "_replicate_b9296354cdf1dbe0046de11f57a5a24f8f6a78a8 , " +
          "jio_attachment/";
        equal(
          error.message.substring(0, error_message.length),
          error_message
        );
      })
      .fail(function (error) {
        ok(false, error);
      })
      .always(function () {
        start();
      });
  });

  test("local deletion and remote modifications", function () {
    stop();
    expect(4);

    var id,
      context = this,
      blob = new Blob([big_string + "a"]),
      blob2 = new Blob([big_string]);

    context.jio.post({"title": "foo"})
      .then(function (result) {
        id = result;
        return context.jio.putAttachment(id, "foo", blob);
      })
      .then(function () {
        return context.jio.repair();
      })
      .then(function () {
        return RSVP.all([
          context.jio.removeAttachment(id, "foo"),
          context.jio.__storage._remote_sub_storage
                     .putAttachment(id, "foo", blob2)
        ]);
      })
      .then(function () {
        return context.jio.repair();
      })
      .then(function (report) {
        deepEqual(report._list, [
          [report.LOG_NO_CHANGE, id],
          [report.LOG_FORCE_PUT_LOCAL_ATTACHMENT, id, 'foo']
        ]);
        return context.jio.getAttachment(
          id,
          "foo",
          {format: "text"}
        );
      })
      .then(function (result) {
        equal(true, big_string === result);
        return context.jio.__storage._remote_sub_storage.getAttachment(
          id,
          "foo",
          {format: "text"}
        );
      })
      .then(function (result) {
        equal(true, big_string === result);
        return context.jio.__storage._signature_sub_storage
                      .getAttachment(id, "foo", {format: "json"});
      })
      .then(function (result) {
        deepEqual(result, {
          hash: "cd762363c1c11ecb48611583520bba111f0034d4"
        });
      })
      .fail(function (error) {
        ok(false, error);
      })
      .always(function () {
        start();
      });
  });

  test("local deletion and remote modifications: keep local", function () {
    stop();
    expect(10);

    var id,
      context = this,
      blob = new Blob([big_string + "a"]),
      blob2 = new Blob([big_string]);

    this.jio = jIO.createJIO({
      type: "replicate",
      report_level: 1000,
      conflict_handling: 1,
      check_local_attachment_creation: true,
      check_local_attachment_deletion: true,
      check_local_attachment_modification: true,
      check_remote_attachment_creation: true,
      check_remote_attachment_deletion: true,
      check_remote_attachment_modification: true,
      local_sub_storage: {
        type: "uuid",
        sub_storage: {
          type: "memory"
        }
      },
      remote_sub_storage: {
        type: "uuid",
        sub_storage: {
          type: "memory"
        }
      }
    });

    context.jio.post({"title": "foo"})
      .then(function (result) {
        id = result;
        return context.jio.putAttachment(id, "foo", blob);
      })
      .then(function () {
        return context.jio.repair();
      })
      .then(function () {
        return RSVP.all([
          context.jio.removeAttachment(id, "foo"),
          context.jio.__storage._remote_sub_storage
                     .putAttachment(id, "foo", blob2)
        ]);
      })
      .then(function () {
        return context.jio.repair();
      })
      .then(function (report) {
        deepEqual(report._list, [
          [report.LOG_NO_CHANGE, id],
          [report.LOG_FORCE_DELETE_REMOTE_ATTACHMENT, id, 'foo']
        ]);
        return context.jio.getAttachment(
          id,
          "foo",
          {format: "text"}
        );
      })
      .fail(function (error) {
        ok(error instanceof jIO.util.jIOError);
        equal(error.status_code, 404);
        equal(error.message, "Cannot find attachment: " + id + " , foo");
        return context.jio.__storage._remote_sub_storage.getAttachment(
          id,
          "foo",
          {format: "text"}
        );
      })
      .fail(function (error) {
        ok(error instanceof jIO.util.jIOError);
        equal(error.status_code, 404);
        equal(error.message, "Cannot find attachment: " + id + " , foo");
        return context.jio.__storage._signature_sub_storage
                      .getAttachment(id, "foo", {format: "json"});
      })
      .fail(function (error) {
        ok(error instanceof jIO.util.jIOError);
        equal(error.status_code, 404);
        var error_message = "Cannot find attachment: " +
          "_replicate_b9296354cdf1dbe0046de11f57a5a24f8f6a78a8 , " +
          "jio_attachment/";
        equal(
          error.message.substring(0, error_message.length),
          error_message
        );
      })
      .fail(function (error) {
        ok(false, error);
      })
      .always(function () {
        start();
      });
  });

  test("local deletion and remote modifications: keep local, dont check local",
       function () {
      stop();
      expect(10);

      var id,
        context = this,
        blob = new Blob([big_string + "a"]),
        blob2 = new Blob([big_string]);

      this.jio = jIO.createJIO({
        type: "replicate",
        report_level: 1000,
        conflict_handling: 1,
        check_local_attachment_creation: true,
        check_local_attachment_deletion: false,
        check_local_attachment_modification: true,
        check_remote_attachment_creation: true,
        check_remote_attachment_deletion: true,
        check_remote_attachment_modification: true,
        local_sub_storage: {
          type: "uuid",
          sub_storage: {
            type: "memory"
          }
        },
        remote_sub_storage: {
          type: "uuid",
          sub_storage: {
            type: "memory"
          }
        }
      });

      context.jio.post({"title": "foo"})
        .then(function (result) {
          id = result;
          return context.jio.putAttachment(id, "foo", blob);
        })
        .then(function () {
          return context.jio.repair();
        })
        .then(function () {
          return RSVP.all([
            context.jio.removeAttachment(id, "foo"),
            context.jio.__storage._remote_sub_storage
                       .putAttachment(id, "foo", blob2)
          ]);
        })
        .then(function () {
          return context.jio.repair();
        })
        .then(function (report) {
          deepEqual(report._list, [
            [report.LOG_NO_CHANGE, id],
            [report.LOG_SKIP_LOCAL_ATTACHMENT_DELETION, id, 'foo'],
            [report.LOG_FORCE_DELETE_REMOTE_ATTACHMENT, id, 'foo']
          ]);
          return context.jio.getAttachment(
            id,
            "foo",
            {format: "text"}
          );
        })
        .fail(function (error) {
          ok(error instanceof jIO.util.jIOError);
          equal(error.status_code, 404);
          equal(error.message, "Cannot find attachment: " + id + " , foo");
          return context.jio.__storage._remote_sub_storage.getAttachment(
            id,
            "foo",
            {format: "text"}
          );
        })
        .fail(function (error) {
          ok(error instanceof jIO.util.jIOError);
          equal(error.status_code, 404);
          equal(error.message, "Cannot find attachment: " + id + " , foo");
          return context.jio.__storage._signature_sub_storage
                        .getAttachment(id, "foo", {format: "json"});
        })
        .fail(function (error) {
          ok(error instanceof jIO.util.jIOError);
          equal(error.status_code, 404);
          var error_message = "Cannot find attachment: " +
            "_replicate_b9296354cdf1dbe0046de11f57a5a24f8f6a78a8 , " +
            "jio_attachment/";
          equal(
            error.message.substring(0, error_message.length),
            error_message
          );
        })
        .fail(function (error) {
          ok(false, error);
        })
        .always(function () {
          start();
        });
    });

  test("local deletion and remote modifications: keep remote", function () {
    stop();
    expect(4);

    var id,
      context = this,
      blob = new Blob([big_string + "a"]),
      blob2 = new Blob([big_string]);

    this.jio = jIO.createJIO({
      type: "replicate",
      report_level: 1000,
      conflict_handling: 2,
      check_local_attachment_creation: true,
      check_local_attachment_deletion: true,
      check_local_attachment_modification: true,
      check_remote_attachment_creation: true,
      check_remote_attachment_deletion: true,
      check_remote_attachment_modification: true,
      local_sub_storage: {
        type: "uuid",
        sub_storage: {
          type: "memory"
        }
      },
      remote_sub_storage: {
        type: "uuid",
        sub_storage: {
          type: "memory"
        }
      }
    });

    context.jio.post({"title": "foo"})
      .then(function (result) {
        id = result;
        return context.jio.putAttachment(id, "foo", blob);
      })
      .then(function () {
        return context.jio.repair();
      })
      .then(function () {
        return RSVP.all([
          context.jio.removeAttachment(id, "foo"),
          context.jio.__storage._remote_sub_storage
                     .putAttachment(id, "foo", blob2)
        ]);
      })
      .then(function () {
        return context.jio.repair();
      })
      .then(function (report) {
        deepEqual(report._list, [
          [report.LOG_NO_CHANGE, id],
          [report.LOG_FORCE_PUT_LOCAL_ATTACHMENT, id, 'foo']
        ]);
        return context.jio.getAttachment(
          id,
          "foo",
          {format: "text"}
        );
      })
      .then(function (result) {
        equal(true, big_string === result);
        return context.jio.__storage._remote_sub_storage.getAttachment(
          id,
          "foo",
          {format: "text"}
        );
      })
      .then(function (result) {
        equal(true, big_string === result);
        return context.jio.__storage._signature_sub_storage
                      .getAttachment(id, "foo", {format: "json"});
      })
      .then(function (result) {
        deepEqual(result, {
          hash: "cd762363c1c11ecb48611583520bba111f0034d4"
        });
      })
      .fail(function (error) {
        ok(false, error);
      })
      .always(function () {
        start();
      });
  });

  test("local deletion and remote modifications: ignore", function () {
    stop();
    expect(6);

    var id,
      context = this,
      blob = new Blob([big_string + "a"]),
      blob2 = new Blob([big_string]);

    this.jio = jIO.createJIO({
      type: "replicate",
      report_level: 1000,
      conflict_handling: 3,
      check_local_attachment_creation: true,
      check_local_attachment_deletion: true,
      check_local_attachment_modification: true,
      check_remote_attachment_creation: true,
      check_remote_attachment_deletion: true,
      check_remote_attachment_modification: true,
      local_sub_storage: {
        type: "uuid",
        sub_storage: {
          type: "memory"
        }
      },
      remote_sub_storage: {
        type: "uuid",
        sub_storage: {
          type: "memory"
        }
      }
    });

    context.jio.post({"title": "foo"})
      .then(function (result) {
        id = result;
        return context.jio.putAttachment(id, "foo", blob);
      })
      .then(function () {
        return context.jio.repair();
      })
      .then(function () {
        return RSVP.all([
          context.jio.removeAttachment(id, "foo"),
          context.jio.__storage._remote_sub_storage
                     .putAttachment(id, "foo", blob2)
        ]);
      })
      .then(function () {
        return context.jio.repair();
      })
      .then(function (report) {
        deepEqual(report._list, [
          [report.LOG_NO_CHANGE, id],
          [report.LOG_SKIP_CONFLICT_ATTACHMENT, id, 'foo']
        ]);
        return context.jio.getAttachment(
          id,
          "foo",
          {format: "text"}
        );
      })
      .fail(function (error) {
        ok(error instanceof jIO.util.jIOError);
        equal(error.status_code, 404);
        equal(error.message, "Cannot find attachment: " + id + " , foo");
        return context.jio.__storage._remote_sub_storage.getAttachment(
          id,
          "foo",
          {format: "text"}
        );
      })
      .then(function (result) {
        equal(true, big_string === result);
        return context.jio.__storage._signature_sub_storage
                      .getAttachment(id, "foo", {format: "json"});
      })
      .then(function (result) {
        deepEqual(result, {
          hash: "65cf771ad2cc0b1e8f89361e3b7bec2365b3ad24"
        });
      })
      .fail(function (error) {
        ok(false, error);
      })
      .always(function () {
        start();
      });
  });

  test("local modifications and remote deletion", function () {
    stop();
    expect(4);

    var id,
      context = this,
      blob = new Blob([big_string + "a"]),
      blob2 = new Blob([big_string]);

    context.jio.post({"title": "foo"})
      .then(function (result) {
        id = result;
        return context.jio.putAttachment(id, "foo", blob);
      })
      .then(function () {
        return context.jio.repair();
      })
      .then(function () {
        return RSVP.all([
          context.jio.putAttachment(id, "foo", blob2),
          context.jio.__storage._remote_sub_storage
                      .removeAttachment(id, "foo")
        ]);
      })
      .then(function () {
        return context.jio.repair();
      })
      .then(function (report) {
        deepEqual(report._list, [
          [report.LOG_NO_CHANGE, id],
          [report.LOG_PUT_REMOTE_ATTACHMENT, id, 'foo']
        ]);
        return context.jio.getAttachment(
          id,
          "foo",
          {format: "text"}
        );
      })
      .then(function (result) {
        equal(true, big_string === result);
        return context.jio.__storage._remote_sub_storage.getAttachment(
          id,
          "foo",
          {format: "text"}
        );
      })
      .then(function (result) {
        equal(true, big_string === result);
        return context.jio.__storage._signature_sub_storage
                      .getAttachment(id, "foo", {format: "json"});
      })
      .then(function (result) {
        deepEqual(result, {
          hash: "cd762363c1c11ecb48611583520bba111f0034d4"
        });
      })
      .fail(function (error) {
        ok(false, error);
      })
      .always(function () {
        start();
      });
  });

  test("local modifications and remote deletion: keep remote", function () {
    stop();
    expect(10);

    var id,
      context = this,
      blob = new Blob([big_string + "a"]),
      blob2 = new Blob([big_string]);

    this.jio = jIO.createJIO({
      type: "replicate",
      report_level: 1000,
      conflict_handling: 2,
      check_local_attachment_creation: true,
      check_local_attachment_deletion: true,
      check_local_attachment_modification: true,
      check_remote_attachment_creation: true,
      check_remote_attachment_deletion: true,
      check_remote_attachment_modification: true,
      local_sub_storage: {
        type: "uuid",
        sub_storage: {
          type: "memory"
        }
      },
      remote_sub_storage: {
        type: "uuid",
        sub_storage: {
          type: "memory"
        }
      }
    });

    context.jio.post({"title": "foo"})
      .then(function (result) {
        id = result;
        return context.jio.putAttachment(id, "foo", blob);
      })
      .then(function () {
        return context.jio.repair();
      })
      .then(function () {
        return RSVP.all([
          context.jio.putAttachment(id, "foo", blob2),
          context.jio.__storage._remote_sub_storage.removeAttachment(id, "foo")
        ]);
      })
      .then(function () {
        return context.jio.repair();
      })
      .then(function (report) {
        deepEqual(report._list, [
          [report.LOG_NO_CHANGE, id],
          [report.LOG_FORCE_DELETE_LOCAL_ATTACHMENT, id, 'foo']
        ]);
        return context.jio.getAttachment(
          id,
          "foo",
          {format: "text"}
        );
      })
      .fail(function (error) {
        ok(error instanceof jIO.util.jIOError);
        equal(error.status_code, 404);
        equal(error.message, "Cannot find attachment: " + id + " , foo");
        return context.jio.__storage._remote_sub_storage.getAttachment(
          id,
          "foo",
          {format: "text"}
        );
      })
      .fail(function (error) {
        ok(error instanceof jIO.util.jIOError);
        equal(error.status_code, 404);
        equal(error.message, "Cannot find attachment: " + id + " , foo");
        return context.jio.__storage._signature_sub_storage
                      .getAttachment(id, "foo", {format: "json"});
      })
      .fail(function (error) {
        ok(error instanceof jIO.util.jIOError);
        equal(error.status_code, 404);
        var error_message = "Cannot find attachment: " +
          "_replicate_b9296354cdf1dbe0046de11f57a5a24f8f6a78a8 , " +
          "jio_attachment/";
        equal(
          error.message.substring(0, error_message.length),
          error_message
        );
      })
      .fail(function (error) {
        ok(false, error);
      })
      .always(function () {
        start();
      });
  });

  test("local modifications and remote deletion: keep local", function () {
    stop();
    expect(4);

    var id,
      context = this,
      blob = new Blob([big_string + "a"]),
      blob2 = new Blob([big_string]);

    this.jio = jIO.createJIO({
      type: "replicate",
      report_level: 1000,
      conflict_handling: 1,
      check_local_attachment_creation: true,
      check_local_attachment_deletion: true,
      check_local_attachment_modification: true,
      check_remote_attachment_creation: true,
      check_remote_attachment_deletion: true,
      check_remote_attachment_modification: true,
      local_sub_storage: {
        type: "uuid",
        sub_storage: {
          type: "memory"
        }
      },
      remote_sub_storage: {
        type: "uuid",
        sub_storage: {
          type: "memory"
        }
      }
    });

    context.jio.post({"title": "foo"})
      .then(function (result) {
        id = result;
        return context.jio.putAttachment(id, "foo", blob);
      })
      .then(function () {
        return context.jio.repair();
      })
      .then(function () {
        return RSVP.all([
          context.jio.putAttachment(id, "foo", blob2),
          context.jio.__storage._remote_sub_storage.removeAttachment(id, "foo")
        ]);
      })
      .then(function () {
        return context.jio.repair();
      })
      .then(function (report) {
        deepEqual(report._list, [
          [report.LOG_NO_CHANGE, id],
          [report.LOG_FORCE_PUT_REMOTE_ATTACHMENT, id, 'foo']
        ]);
        return context.jio.getAttachment(
          id,
          "foo",
          {format: "text"}
        );
      })
      .then(function (result) {
        equal(true, big_string === result);
        return context.jio.__storage._remote_sub_storage.getAttachment(
          id,
          "foo",
          {format: "text"}
        );
      })
      .then(function (result) {
        equal(true, big_string === result);
        return context.jio.__storage._signature_sub_storage
                      .getAttachment(id, "foo", {format: "json"});
      })
      .then(function (result) {
        deepEqual(result, {
          hash: "cd762363c1c11ecb48611583520bba111f0034d4"
        });
      })
      .fail(function (error) {
        ok(false, error);
      })
      .always(function () {
        start();
      });
  });

  test("local modif and remote del: keep remote, not check modif", function () {
    stop();
    expect(10);

    var id,
      context = this,
      blob = new Blob([big_string + "a"]),
      blob2 = new Blob([big_string]);

    this.jio = jIO.createJIO({
      type: "replicate",
      report_level: 1000,
      conflict_handling: 2,
      check_local_attachment_creation: true,
      check_local_attachment_deletion: true,
      check_local_attachment_modification: false,
      check_remote_attachment_creation: true,
      check_remote_attachment_deletion: true,
      check_remote_attachment_modification: true,
      local_sub_storage: {
        type: "uuid",
        sub_storage: {
          type: "memory"
        }
      },
      remote_sub_storage: {
        type: "uuid",
        sub_storage: {
          type: "memory"
        }
      }
    });

    context.jio.post({"title": "foo"})
      .then(function (result) {
        id = result;
        return context.jio.putAttachment(id, "foo", blob);
      })
      .then(function () {
        return context.jio.repair();
      })
      .then(function () {
        return RSVP.all([
          context.jio.putAttachment(id, "foo", blob2),
          context.jio.__storage._remote_sub_storage.removeAttachment(id, "foo")
        ]);
      })
      .then(function () {
        return context.jio.repair();
      })
      .then(function (report) {
        deepEqual(report._list, [
          [report.LOG_NO_CHANGE, id],
          [report.LOG_SKIP_LOCAL_ATTACHMENT_MODIFICATION, id, 'foo'],
          [report.LOG_FORCE_DELETE_LOCAL_ATTACHMENT, id, 'foo']
        ]);
        return context.jio.getAttachment(
          id,
          "foo",
          {format: "text"}
        );
      })
      .fail(function (error) {
        ok(error instanceof jIO.util.jIOError);
        equal(error.status_code, 404);
        equal(error.message, "Cannot find attachment: " + id + " , foo");
        return context.jio.__storage._remote_sub_storage.getAttachment(
          id,
          "foo",
          {format: "text"}
        );
      })
      .fail(function (error) {
        ok(error instanceof jIO.util.jIOError);
        equal(error.status_code, 404);
        equal(error.message, "Cannot find attachment: " + id + " , foo");
        return context.jio.__storage._signature_sub_storage
                      .getAttachment(id, "foo", {format: "json"});
      })
      .fail(function (error) {
        ok(error instanceof jIO.util.jIOError);
        equal(error.status_code, 404);
        var error_message = "Cannot find attachment: " +
          "_replicate_b9296354cdf1dbe0046de11f57a5a24f8f6a78a8 , " +
          "jio_attachment/";
        equal(
          error.message.substring(0, error_message.length),
          error_message
        );
      })
      .fail(function (error) {
        ok(false, error);
      })
      .always(function () {
        start();
      });
  });

  test("local modifications and remote deletion: ignore", function () {
    stop();
    expect(6);

    var id,
      context = this,
      blob = new Blob([big_string + "a"]),
      blob2 = new Blob([big_string]);

    this.jio = jIO.createJIO({
      type: "replicate",
      report_level: 1000,
      conflict_handling: 3,
      check_local_attachment_creation: true,
      check_local_attachment_deletion: true,
      check_local_attachment_modification: true,
      check_remote_attachment_creation: true,
      check_remote_attachment_deletion: true,
      check_remote_attachment_modification: true,
      local_sub_storage: {
        type: "uuid",
        sub_storage: {
          type: "memory"
        }
      },
      remote_sub_storage: {
        type: "uuid",
        sub_storage: {
          type: "memory"
        }
      }
    });

    context.jio.post({"title": "foo"})
      .then(function (result) {
        id = result;
        return context.jio.putAttachment(id, "foo", blob);
      })
      .then(function () {
        return context.jio.repair();
      })
      .then(function () {
        return RSVP.all([
          context.jio.putAttachment(id, "foo", blob2),
          context.jio.__storage._remote_sub_storage.removeAttachment(id, "foo")
        ]);
      })
      .then(function () {
        return context.jio.repair();
      })
      .then(function (report) {
        deepEqual(report._list, [
          [report.LOG_NO_CHANGE, id],
          [report.LOG_SKIP_CONFLICT_ATTACHMENT, id, 'foo']
        ]);
        return context.jio.getAttachment(
          id,
          "foo",
          {format: "text"}
        );
      })
      .then(function (result) {
        equal(true, big_string === result);
        return context.jio.__storage._remote_sub_storage.getAttachment(
          id,
          "foo",
          {format: "text"}
        );
      })
      .fail(function (error) {
        ok(error instanceof jIO.util.jIOError);
        equal(error.status_code, 404);
        equal(error.message, "Cannot find attachment: " + id + " , foo");
        return context.jio.__storage._signature_sub_storage
                      .getAttachment(id, "foo", {format: "json"});
      })
      .then(function (result) {
        deepEqual(result, {
          hash: "65cf771ad2cc0b1e8f89361e3b7bec2365b3ad24"
        });
      })
      .fail(function (error) {
        ok(false, error);
      })
      .always(function () {
        start();
      });
  });

  /////////////////////////////////////////////////////////////////
  // attachment replication performance
  /////////////////////////////////////////////////////////////////
  test("document and attachment deletion performance", function () {
    stop();
    expect(12);

    var id,
      context = this,
      blob = new Blob([big_string]);

    context.jio.post({"title": "foo"})
      .then(function (result) {
        id = result;
        return context.jio.putAttachment(id, "foo", blob);
      })
      .then(function () {
        return context.jio.repair();
      })
      .then(function () {
        return context.jio.remove(id);
      })
      .then(function () {
        return context.jio.repair();
      })
      .then(function () {
        return context.jio.__storage._remote_sub_storage.getAttachment(
          id,
          "foo",
          {format: "text"}
        );
      })
      .fail(function (error) {
        ok(error instanceof jIO.util.jIOError);
        equal(error.status_code, 404);
        equal(error.message, "Cannot find attachment: " + id + " , foo");
        return context.jio.__storage._remote_sub_storage.get(id);
      })
      .fail(function (error) {
        ok(error instanceof jIO.util.jIOError);
        equal(error.status_code, 404);
        equal(error.message, "Cannot find document: " + id);
        return context.jio.__storage._signature_sub_storage
                      .getAttachment(id, "foo", {format: "json"});
      })
      .fail(function (error) {
        ok(error instanceof jIO.util.jIOError);
        equal(error.status_code, 404);
        var error_message = "Cannot find attachment: " +
          "_replicate_b9296354cdf1dbe0046de11f57a5a24f8f6a78a8 , " +
          "jio_attachment/";
        equal(
          error.message.substring(0, error_message.length),
          error_message
        );
        return context.jio.__storage._signature_sub_storage.get(id);
      })
      .fail(function (error) {
        ok(error instanceof jIO.util.jIOError);
        equal(error.status_code, 404);
        var error_message = "Cannot find attachment: " +
          "_replicate_b9296354cdf1dbe0046de11f57a5a24f8f6a78a8 , " +
          "jio_document/";
        equal(
          error.message.substring(0, error_message.length),
          error_message
        );
      })
      .always(function () {
        start();
      });
  });

  test("use 1 parallel operation", function () {
    stop();
    expect(40);

    var context = this,
      order_number = 0,
      expected_order_list = [
        'start get 0',
        'stop get 0',
        'start put 0',
        'stop put 0',
        'start get 1',
        'stop get 1',
        'start put 1',
        'stop put 1',
        'start getAttachment 00',
        'stop getAttachment 00',
        'start putAttachment 00',
        'stop putAttachment 00',
        'start getAttachment 01',
        'stop getAttachment 01',
        'start putAttachment 01',
        'stop putAttachment 01',
        'start getAttachment 02',
        'stop getAttachment 02',
        'start putAttachment 02',
        'stop putAttachment 02',
        'start getAttachment 03',
        'stop getAttachment 03',
        'start putAttachment 03',
        'stop putAttachment 03',
        'start getAttachment 10',
        'stop getAttachment 10',
        'start putAttachment 10',
        'stop putAttachment 10',
        'start getAttachment 11',
        'stop getAttachment 11',
        'start putAttachment 11',
        'stop putAttachment 11',
        'start getAttachment 12',
        'stop getAttachment 12',
        'start putAttachment 12',
        'stop putAttachment 12',
        'start getAttachment 13',
        'stop getAttachment 13',
        'start putAttachment 13',
        'stop putAttachment 13'
      ];

    function assertExecutionOrder(text) {
      equal(text, expected_order_list[order_number],
            expected_order_list[order_number]);
      order_number += 1;
    }

    function StorageOneParallelOperation() {
      this._sub_storage = jIO.createJIO({type: "memory"});
      return this;
    }

    StorageOneParallelOperation.prototype.put = function (id, doc) {
      assertExecutionOrder('start put ' + id);
      var storage = this;
      return storage._sub_storage.put(id, doc)
        .push(function (result) {
          assertExecutionOrder('stop put ' + id);
          return result;
        });
    };

    StorageOneParallelOperation.prototype.get = function (id) {
      assertExecutionOrder('start get ' + id);
      var storage = this;
      return storage._sub_storage.get(id)
        .push(undefined, function (error) {
          assertExecutionOrder('stop get ' + id);
          throw error;
        });
    };

    StorageOneParallelOperation.prototype.getAttachment = function (id, name) {
      assertExecutionOrder('start getAttachment ' + name);
      var storage = this;
      return storage._sub_storage.getAttachment(id, name)
        .push(undefined, function (error) {
          assertExecutionOrder('stop getAttachment ' + name);
          throw error;
        });
    };

    StorageOneParallelOperation.prototype.putAttachment = function (id, name,
                                                                    blob) {
      assertExecutionOrder('start putAttachment ' + name);
      var storage = this;
      return storage._sub_storage.putAttachment(id, name, blob)
        .push(function (result) {
          assertExecutionOrder('stop putAttachment ' + name);
          return result;
        });
    };

    StorageOneParallelOperation.prototype.buildQuery = function () {
      return this._sub_storage.buildQuery.apply(this._sub_storage, arguments);
    };
    StorageOneParallelOperation.prototype.allAttachments = function () {
      return this._sub_storage.allAttachments.apply(this._sub_storage,
        arguments);
    };

    StorageOneParallelOperation.prototype.hasCapacity = function () {
      return this._sub_storage.hasCapacity.apply(this._sub_storage, arguments);
    };

    jIO.addStorage(
      'one_parallel_attachment',
      StorageOneParallelOperation
    );

    this.jio = jIO.createJIO({
      type: "replicate",
      report_level: 1000,
      check_local_attachment_creation: true,
      local_sub_storage: {
        type: "memory"
      },
      remote_sub_storage: {
        type: "one_parallel_attachment"
      }
    });

    return RSVP.all([
      context.jio.put("0", {}),
      context.jio.put("1", {})
    ])
      .then(function () {
        return RSVP.all([
          context.jio.putAttachment("0", "00", new Blob(["0"])),
          context.jio.putAttachment("0", "01", new Blob(["1"])),
          context.jio.putAttachment("0", "02", new Blob(["2"])),
          context.jio.putAttachment("0", "03", new Blob(["3"])),
          context.jio.putAttachment("1", "10", new Blob(["0"])),
          context.jio.putAttachment("1", "11", new Blob(["1"])),
          context.jio.putAttachment("1", "12", new Blob(["2"])),
          context.jio.putAttachment("1", "13", new Blob(["3"]))
        ]);
      })
      .then(function () {
        return context.jio.repair();
      })
      .fail(function (error) {
        ok(false, error);
      })
      .always(function () {
        start();
      });
  });

  test("use 2 parallel operation", function () {
    stop();
    expect(40);

    var context = this,
      order_number = 0,
      expected_order_list = [
        'start get 0',
        'stop get 0',
        'start put 0',
        'stop put 0',
        'start get 1',
        'stop get 1',
        'start put 1',
        'stop put 1',

        'start getAttachment 00',

        'start getAttachment 01',
        'stop getAttachment 01',
        'start putAttachment 01',
        'stop putAttachment 01',
        'start getAttachment 02',
        'stop getAttachment 02',
        'start putAttachment 02',

        'stop getAttachment 00',
        'start putAttachment 00',
        'stop putAttachment 00',
        'start getAttachment 03',
        'stop getAttachment 03',
        'start putAttachment 03',
        'stop putAttachment 03',

        'stop putAttachment 02',

        'start getAttachment 10',

        'start getAttachment 11',
        'stop getAttachment 11',
        'start putAttachment 11',
        'stop putAttachment 11',
        'start getAttachment 12',
        'stop getAttachment 12',
        'start putAttachment 12',

        'stop getAttachment 10',
        'start putAttachment 10',
        'stop putAttachment 10',
        'start getAttachment 13',
        'stop getAttachment 13',
        'start putAttachment 13',
        'stop putAttachment 13',

        'stop putAttachment 12'
      ],
      defer0,
      defer2;

    function assertExecutionOrder(text) {
      equal(text, expected_order_list[order_number],
            expected_order_list[order_number]);
      order_number += 1;
    }

    function StorageTwoParallelOperation() {
      this._sub_storage = jIO.createJIO({type: "memory"});
      return this;
    }

    StorageTwoParallelOperation.prototype.put = function (id, doc) {
      assertExecutionOrder('start put ' + id);
      var storage = this;
      return storage._sub_storage.put(id, doc)
        .push(function (result) {
          assertExecutionOrder('stop put ' + id);
          return result;
        });
    };

    StorageTwoParallelOperation.prototype.get = function (id) {
      assertExecutionOrder('start get ' + id);
      var storage = this;
      return storage._sub_storage.get(id)
        .push(undefined, function (error) {
          assertExecutionOrder('stop get ' + id);
          throw error;
        });
    };


    StorageTwoParallelOperation.prototype.getAttachment = function (id,
                                                                     name) {
      assertExecutionOrder('start getAttachment ' + name);
      var storage = this;
      return new RSVP.Queue()
        .push(function () {
          if (name[1] === "0") {
            defer0 = RSVP.defer();
            return defer0.promise;
          }
        })
        .push(function () {
          return storage._sub_storage.getAttachment(id, name);
        })
        .push(undefined, function (error) {
          assertExecutionOrder('stop getAttachment ' + name);
          throw error;
        });
    };

    StorageTwoParallelOperation.prototype.putAttachment = function (id, name,
                                                                     blob) {
      assertExecutionOrder('start putAttachment ' + name);
      var storage = this;
      return new RSVP.Queue()
        .push(function () {
          if (name[1] === "2") {
            defer0.resolve();
            defer2 = RSVP.defer();
            return defer2.promise;
          }
        })
        .push(function () {
          return storage._sub_storage.putAttachment(id, name, blob);
        })
        .push(function (result) {
          if (name[1] === "3") {
            defer2.resolve();
          }
          assertExecutionOrder('stop putAttachment ' + name);
          return result;
        });
    };


    StorageTwoParallelOperation.prototype.buildQuery = function () {
      return this._sub_storage.buildQuery.apply(this._sub_storage, arguments);
    };
    StorageTwoParallelOperation.prototype.allAttachments = function () {
      return this._sub_storage.allAttachments.apply(this._sub_storage,
        arguments);
    };

    StorageTwoParallelOperation.prototype.hasCapacity = function () {
      return this._sub_storage.hasCapacity.apply(this._sub_storage, arguments);
    };

    jIO.addStorage(
      'two_parallel_attachment',
      StorageTwoParallelOperation
    );

    this.jio = jIO.createJIO({
      type: "replicate",
      report_level: 1000,
      check_local_attachment_creation: true,
      parallel_operation_attachment_amount: 2,
      local_sub_storage: {
        type: "memory"
      },
      remote_sub_storage: {
        type: "two_parallel_attachment"
      }
    });

    return RSVP.all([
      context.jio.put("0", {}),
      context.jio.put("1", {})
    ])
      .then(function () {
        return RSVP.all([
          context.jio.putAttachment("0", "00", new Blob(["0"])),
          context.jio.putAttachment("0", "01", new Blob(["1"])),
          context.jio.putAttachment("0", "02", new Blob(["2"])),
          context.jio.putAttachment("0", "03", new Blob(["3"])),
          context.jio.putAttachment("1", "10", new Blob(["0"])),
          context.jio.putAttachment("1", "11", new Blob(["1"])),
          context.jio.putAttachment("1", "12", new Blob(["2"])),
          context.jio.putAttachment("1", "13", new Blob(["3"]))
        ]);
      })
      .then(function () {
        return context.jio.repair();
      })
      .fail(function (error) {
        ok(false, error);
      })
      .always(function () {
        start();
      });
  });

  test("use 4 parallel operation", function () {
    stop();
    expect(24);

    var context = this,
      order_number = 0,
      expected_order_list = [
        'start get 0',
        'stop get 0',
        'start put 0',
        'stop put 0',
        'start get 1',
        'stop get 1',
        'start put 1',
        'stop put 1',

        'start getAttachment 00',
        'start getAttachment 01',
        'start getAttachment 02',
        'start getAttachment 03',

        'stop putAttachment 00',
        'stop putAttachment 01',
        'stop putAttachment 02',
        'stop putAttachment 03',

        'start getAttachment 10',
        'start getAttachment 11',
        'start getAttachment 12',
        'start getAttachment 13',

        'stop putAttachment 10',
        'stop putAttachment 11',
        'stop putAttachment 12',
        'stop putAttachment 13'

      ];

    function assertExecutionOrder(text) {
      equal(text, expected_order_list[order_number],
            expected_order_list[order_number]);
      order_number += 1;
    }

    function StorageFourParallelOperation() {
      this._sub_storage = jIO.createJIO({type: "memory"});
      return this;
    }

    StorageFourParallelOperation.prototype.put = function (id, doc) {
      assertExecutionOrder('start put ' + id);
      var storage = this;
      return storage._sub_storage.put(id, doc)
        .push(function (result) {
          assertExecutionOrder('stop put ' + id);
          return result;
        });
    };

    StorageFourParallelOperation.prototype.get = function (id) {
      assertExecutionOrder('start get ' + id);
      var storage = this;
      return storage._sub_storage.get(id)
        .push(undefined, function (error) {
          assertExecutionOrder('stop get ' + id);
          throw error;
        });
    };

    StorageFourParallelOperation.prototype.getAttachment = function (id,
                                                                     name) {
      assertExecutionOrder('start getAttachment ' + name);
      var storage = this;
      return storage._sub_storage.getAttachment(id, name)
        .push(undefined, function (error) {
          // assertExecutionOrder('stop getAttachment ' + name);
          throw error;
        });
    };

    StorageFourParallelOperation.prototype.putAttachment = function (id, name,
                                                                     blob) {
      // assertExecutionOrder('start putAttachment ' + name);
      var storage = this;
      return storage._sub_storage.putAttachment(id, name, blob)
        .push(function (result) {
          assertExecutionOrder('stop putAttachment ' + name);
          return result;
        });
    };

    StorageFourParallelOperation.prototype.buildQuery = function () {
      return this._sub_storage.buildQuery.apply(this._sub_storage, arguments);
    };
    StorageFourParallelOperation.prototype.allAttachments = function () {
      return this._sub_storage.allAttachments.apply(this._sub_storage,
        arguments);
    };

    StorageFourParallelOperation.prototype.hasCapacity = function () {
      return this._sub_storage.hasCapacity.apply(this._sub_storage, arguments);
    };

    jIO.addStorage(
      'four_parallel_attachment',
      StorageFourParallelOperation
    );

    this.jio = jIO.createJIO({
      type: "replicate",
      report_level: 1000,
      check_local_attachment_creation: true,
      parallel_operation_attachment_amount: 4,
      local_sub_storage: {
        type: "memory"
      },
      remote_sub_storage: {
        type: "four_parallel_attachment"
      }
    });

    return RSVP.all([
      context.jio.put("0", {}),
      context.jio.put("1", {})
    ])
      .then(function () {
        return RSVP.all([
          context.jio.putAttachment("0", "00", new Blob(["0"])),
          context.jio.putAttachment("0", "01", new Blob(["1"])),
          context.jio.putAttachment("0", "02", new Blob(["2"])),
          context.jio.putAttachment("0", "03", new Blob(["3"])),
          context.jio.putAttachment("1", "10", new Blob(["0"])),
          context.jio.putAttachment("1", "11", new Blob(["1"])),
          context.jio.putAttachment("1", "12", new Blob(["2"])),
          context.jio.putAttachment("1", "13", new Blob(["3"]))
        ]);
      })
      .then(function () {
        return context.jio.repair();
      })
      .fail(function (error) {
        ok(false, error);
      })
      .always(function () {
        start();
      });
  });

  test("attachment skipped when local document deletion skipped", function () {
    stop();
    expect(19);

    var id,
      context = this,
      blob = new Blob(['a']),
      blob2 = new Blob(['b']);

    this.jio = jIO.createJIO({
      type: "replicate",
      report_level: 1000,
      check_local_deletion: false,
      check_local_attachment_modification: true,
      check_local_attachment_creation: true,
      check_local_attachment_deletion: true,
      check_remote_attachment_modification: true,
      check_remote_attachment_creation: true,
      check_remote_attachment_deletion: true,
      local_sub_storage: {
        type: "uuid",
        sub_storage: {
          type: "memory"
        }
      },
      remote_sub_storage: {
        type: "uuid",
        sub_storage: {
          type: "memory"
        }
      }
    });

    context.jio.post({"title": "foo"})
      .then(function (result) {
        id = result;
        return RSVP.all([
          context.jio.putAttachment(id, "foo", blob),
          context.jio.putAttachment(id, "foomod", blob),
          context.jio.putAttachment(id, "foodel", blob)
        ]);
      })
      .then(function () {
        return context.jio.repair();
      })
      .then(function () {
        return RSVP.all([
          context.jio.remove(id),
          context.jio.__storage._remote_sub_storage
                               .putAttachment(id, "foomod", blob2),
          context.jio.__storage._remote_sub_storage
                               .putAttachment(id, "foocre", blob),
          context.jio.__storage._remote_sub_storage
                               .removeAttachment(id, "foodel")
        ]);
      })
      .then(function () {
        return context.jio.repair();
      })

      .then(function (report) {
        deepEqual(report._list, [
          [report.LOG_SKIP_LOCAL_DELETION, id],
          [report.LOG_NO_CHANGE, id]
        ]);
        ok(true, 'second repair success');

        // local document still deleted
        return context.jio.get(id);
      })
      .fail(function (error) {
        ok(error instanceof jIO.util.jIOError);
        equal(error.status_code, 404);
        equal(error.message, "Cannot find document: " + id);

        // document signature untouched
        return context.jio.__storage._signature_sub_storage
                      .get(id);
      })
      .then(function (result) {
        deepEqual(result, {
          from_local: true,
          hash: "5ea9013447539ad65de308cbd75b5826a2ae30e5"
        });

        // remote document untouched
        return context.jio.__storage._remote_sub_storage.get(id);
      })
      .then(function (result) {
        deepEqual(result, {"title": "foo"});

        // frozen attachment untouched
        return context.jio.__storage._remote_sub_storage.getAttachment(
          id,
          "foo",
          {format: "text"}
        );
      })
      .then(function (result) {
        equal(result, "a");
        // frozen attachment signature not created
        return context.jio.__storage._signature_sub_storage
                      .getAttachment(id, "foo", {format: "json"});
      })
      .then(function (result) {
        deepEqual(result, {hash: "86f7e437faa5a7fce15d1ddcb9eaeaea377667b8"});

        // created attachment untouched
        return context.jio.__storage._remote_sub_storage.getAttachment(
          id,
          "foocre",
          {format: "text"}
        );
      })
      .then(function (result) {
        equal(result, "a");
        // created attachment signature not created
        return context.jio.__storage._signature_sub_storage
                      .getAttachment(id, "foocre", {format: "json"});
      })
      .fail(function (error) {
        ok(error instanceof jIO.util.jIOError);
        equal(error.status_code, 404);
        var error_message = "Cannot find attachment: " +
          "_replicate_b9296354cdf1dbe0046de11f57a5a24f8f6a78a8 , " +
          "jio_attachment/";
        equal(
          error.message.substring(0, error_message.length),
          error_message
        );

        // modified attachment untouched
        return context.jio.__storage._remote_sub_storage.getAttachment(
          id,
          "foomod",
          {format: "text"}
        );
      })
      .then(function (result) {
        equal(result, "b");
        // modified attachment signature not created
        return context.jio.__storage._signature_sub_storage
                      .getAttachment(id, "foomod", {format: "json"});
      })
      .then(function (result) {
        deepEqual(result, {hash: "86f7e437faa5a7fce15d1ddcb9eaeaea377667b8"});

        // deleted attachment untouched
        return context.jio.__storage._remote_sub_storage.getAttachment(
          id,
          "foodel",
          {format: "text"}
        );
      })
      .fail(function (error) {
        ok(error instanceof jIO.util.jIOError);
        equal(error.status_code, 404);
        var error_message = "Cannot find attachment: " +
          id + " , foodel";
        equal(
          error.message.substring(0, error_message.length),
          error_message
        );
        // deleted attachment signature untouched
        return context.jio.__storage._signature_sub_storage
                      .getAttachment(id, "foodel", {format: "json"});
      })
      .then(function (result) {
        deepEqual(result, {hash: "86f7e437faa5a7fce15d1ddcb9eaeaea377667b8"});
      })

      .fail(function (error) {
        ok(false, error);
      })
      .always(function () {
        start();
      });
  });

  test("attachment skipped when remot document deletion skipped", function () {
    stop();
    expect(19);

    var id,
      context = this,
      blob = new Blob(['a']),
      blob2 = new Blob(['b']);

    this.jio = jIO.createJIO({
      type: "replicate",
      report_level: 1000,
      check_remote_deletion: false,
      check_local_attachment_modification: true,
      check_local_attachment_creation: true,
      check_local_attachment_deletion: true,
      check_remote_attachment_modification: true,
      check_remote_attachment_creation: true,
      check_remote_attachment_deletion: true,
      local_sub_storage: {
        type: "uuid",
        sub_storage: {
          type: "memory"
        }
      },
      remote_sub_storage: {
        type: "uuid",
        sub_storage: {
          type: "memory"
        }
      }
    });

    context.jio.post({"title": "foo"})
      .then(function (result) {
        id = result;
        return RSVP.all([
          context.jio.putAttachment(id, "foo", blob),
          context.jio.putAttachment(id, "foomod", blob),
          context.jio.putAttachment(id, "foodel", blob)
        ]);
      })
      .then(function () {
        return context.jio.repair();
      })
      .then(function () {
        return RSVP.all([
          context.jio.__storage._remote_sub_storage.remove(id),
          context.jio.putAttachment(id, "foomod", blob2),
          context.jio.putAttachment(id, "foocre", blob),
          context.jio.removeAttachment(id, "foodel")
        ]);
      })
      .then(function () {
        return context.jio.repair();
      })

      .then(function (report) {
        deepEqual(report._list, [
          [report.LOG_SKIP_REMOTE_DELETION, id]
        ]);
        ok(true, 'second repair success');

        // remote document still deleted
        return context.jio.__storage._remote_sub_storage.get(id);
      })
      .fail(function (error) {
        ok(error instanceof jIO.util.jIOError);
        equal(error.status_code, 404);
        equal(error.message, "Cannot find document: " + id);

        // document signature untouched
        return context.jio.__storage._signature_sub_storage
                      .get(id);
      })
      .then(function (result) {
        deepEqual(result, {
          from_local: true,
          hash: "5ea9013447539ad65de308cbd75b5826a2ae30e5"
        });

        // local document untouched
        return context.jio.get(id);
      })
      .then(function (result) {
        deepEqual(result, {"title": "foo"});

        // frozen attachment untouched
        return context.jio.getAttachment(
          id,
          "foo",
          {format: "text"}
        );
      })
      .then(function (result) {
        equal(result, "a");
        // frozen attachment signature not created
        return context.jio.__storage._signature_sub_storage
                      .getAttachment(id, "foo", {format: "json"});
      })
      .then(function (result) {
        deepEqual(result, {hash: "86f7e437faa5a7fce15d1ddcb9eaeaea377667b8"});

        // created attachment untouched
        return context.jio.getAttachment(
          id,
          "foocre",
          {format: "text"}
        );
      })
      .then(function (result) {
        equal(result, "a");
        // created attachment signature not created
        return context.jio.__storage._signature_sub_storage
                      .getAttachment(id, "foocre", {format: "json"});
      })
      .fail(function (error) {
        ok(error instanceof jIO.util.jIOError);
        equal(error.status_code, 404);
        var error_message = "Cannot find attachment: " +
          "_replicate_b9296354cdf1dbe0046de11f57a5a24f8f6a78a8 , " +
          "jio_attachment/";
        equal(
          error.message.substring(0, error_message.length),
          error_message
        );

        // modified attachment untouched
        return context.jio.getAttachment(
          id,
          "foomod",
          {format: "text"}
        );
      })
      .then(function (result) {
        equal(result, "b");
        // modified attachment signature not created
        return context.jio.__storage._signature_sub_storage
                      .getAttachment(id, "foomod", {format: "json"});
      })
      .then(function (result) {
        deepEqual(result, {hash: "86f7e437faa5a7fce15d1ddcb9eaeaea377667b8"});

        // deleted attachment untouched
        return context.jio.getAttachment(
          id,
          "foodel",
          {format: "text"}
        );
      })
      .fail(function (error) {
        ok(error instanceof jIO.util.jIOError);
        equal(error.status_code, 404);
        var error_message = "Cannot find attachment: " +
          id + " , foodel";
        equal(
          error.message.substring(0, error_message.length),
          error_message
        );
        // deleted attachment signature untouched
        return context.jio.__storage._signature_sub_storage
                      .getAttachment(id, "foodel", {format: "json"});
      })
      .then(function (result) {
        deepEqual(result, {hash: "86f7e437faa5a7fce15d1ddcb9eaeaea377667b8"});
      })

      .fail(function (error) {
        ok(false, error);
      })
      .always(function () {
        start();
      });
  });

  test("att sig deleted when local doc del resolved", function () {
    stop();
    expect(17);

    var id,
      context = this,
      blob = new Blob(['a']),
      blob2 = new Blob(['b']);

    this.jio = jIO.createJIO({
      type: "replicate",
      report_level: 1000,
      check_local_attachment_modification: true,
      check_local_attachment_creation: true,
      check_local_attachment_deletion: true,
      check_remote_attachment_modification: true,
      check_remote_attachment_creation: true,
      check_remote_attachment_deletion: true,
      local_sub_storage: {
        type: "uuid",
        sub_storage: {
          type: "memory"
        }
      },
      remote_sub_storage: {
        type: "uuid",
        sub_storage: {
          type: "memory"
        }
      }
    });

    context.jio.post({"title": "foo"})
      .then(function (result) {
        id = result;
        return RSVP.all([
          context.jio.putAttachment(id, "foo", blob),
          context.jio.putAttachment(id, "foomod", blob),
          context.jio.putAttachment(id, "foodel", blob)
        ]);
      })
      .then(function () {
        return context.jio.repair();
      })
      .then(function () {
        return RSVP.all([
          context.jio.remove(id),
          context.jio.__storage._remote_sub_storage
                               .put(id, {title: 'foo2'}),
          context.jio.__storage._remote_sub_storage
                               .putAttachment(id, "foomod", blob2),
          context.jio.__storage._remote_sub_storage
                               .putAttachment(id, "foocre", blob),
          context.jio.__storage._remote_sub_storage
                               .removeAttachment(id, "foodel")
        ]);
      })
      .then(function () {
        return context.jio.repair();
      })

      .then(function (report) {
        deepEqual(report._list, [
          [report.LOG_FORCE_PUT_LOCAL, id],
          [report.LOG_PUT_LOCAL_ATTACHMENT, id, 'foo'],
          [report.LOG_PUT_LOCAL_ATTACHMENT, id, 'foomod'],
          [report.LOG_PUT_LOCAL_ATTACHMENT, id, 'foocre']
        ]);
        ok(true, 'second repair success');

        // local document recreated
        return context.jio.get(id);
      })
      .then(function (result) {
        deepEqual(result, {title: "foo2"});

        // document signature modified
        return context.jio.__storage._signature_sub_storage
                      .get(id);
      })
      .then(function (result) {
        deepEqual(result, {
          from_local: false,
          hash: "9819187e39531fdc9bcfd40dbc6a7d3c78fe8dab"
        });

        // remote document untouched
        return context.jio.__storage._remote_sub_storage.get(id);
      })
      .then(function (result) {
        deepEqual(result, {"title": "foo2"});

        // frozen attachment untouched
        return context.jio.getAttachment(
          id,
          "foo",
          {format: "text"}
        );
      })
      .then(function (result) {
        equal(result, "a");
        // frozen attachment signature not created
        return context.jio.__storage._signature_sub_storage
                      .getAttachment(id, "foo", {format: "json"});
      })
      .then(function (result) {
        deepEqual(result, {hash: "86f7e437faa5a7fce15d1ddcb9eaeaea377667b8"});

        // created attachment copied
        return context.jio.getAttachment(
          id,
          "foocre",
          {format: "text"}
        );
      })
      .then(function (result) {
        equal(result, "a");
        // created attachment signature created
        return context.jio.__storage._signature_sub_storage
                      .getAttachment(id, "foocre", {format: "json"});
      })
      .then(function (result) {
        deepEqual(result, {hash: "86f7e437faa5a7fce15d1ddcb9eaeaea377667b8"});

        // modified attachment copied
        return context.jio.getAttachment(
          id,
          "foomod",
          {format: "text"}
        );
      })
      .then(function (result) {
        equal(result, "b");
        // modified attachment signature created
        return context.jio.__storage._signature_sub_storage
                      .getAttachment(id, "foomod", {format: "json"});
      })
      .then(function (result) {
        deepEqual(result, {hash: "e9d71f5ee7c92d6dc9e92ffdad17b8bd49418f98"});

        // deleted attachment dropped
        return context.jio.getAttachment(
          id,
          "foodel",
          {format: "text"}
        );
      })
      .fail(function (error) {
        ok(error instanceof jIO.util.jIOError);
        equal(error.status_code, 404);
        var error_message = "Cannot find attachment: " +
          id + " , foodel";
        equal(
          error.message.substring(0, error_message.length),
          error_message
        );
        // deleted attachment signature untouched
        return context.jio.__storage._signature_sub_storage
                      .getAttachment(id, "foodel", {format: "json"});
      })
      .fail(function (error) {
        ok(error instanceof jIO.util.jIOError);
        equal(error.status_code, 404);
        var error_message = "Cannot find attachment: " +
          "_replicate_b9296354cdf1dbe0046de11f57a5a24f8f6a78a8 , " +
          "jio_attachment/";
        equal(
          error.message.substring(0, error_message.length),
          error_message
        );
      })

      .fail(function (error) {
        ok(false, error);
      })
      .always(function () {
        start();
      });
  });

  test("att sig deleted when remot doc del resolved", function () {
    stop();
    expect(17);

    var id,
      context = this,
      blob = new Blob(['a']),
      blob2 = new Blob(['b']);

    this.jio = jIO.createJIO({
      type: "replicate",
      report_level: 1000,
      check_local_attachment_modification: true,
      check_local_attachment_creation: true,
      check_local_attachment_deletion: true,
      check_remote_attachment_modification: true,
      check_remote_attachment_creation: true,
      check_remote_attachment_deletion: true,
      local_sub_storage: {
        type: "uuid",
        sub_storage: {
          type: "memory"
        }
      },
      remote_sub_storage: {
        type: "uuid",
        sub_storage: {
          type: "memory"
        }
      }
    });

    context.jio.post({"title": "foo"})
      .then(function (result) {
        id = result;
        return RSVP.all([
          context.jio.putAttachment(id, "foo", blob),
          context.jio.putAttachment(id, "foomod", blob),
          context.jio.putAttachment(id, "foodel", blob)
        ]);
      })
      .then(function () {
        return context.jio.repair();
      })
      .then(function () {
        return RSVP.all([
          context.jio.__storage._remote_sub_storage.remove(id),
          context.jio.put(id, {title: 'foo2'}),
          context.jio.putAttachment(id, "foomod", blob2),
          context.jio.putAttachment(id, "foocre", blob),
          context.jio.removeAttachment(id, "foodel")
        ]);
      })
      .then(function () {
        return context.jio.repair();
      })

      .then(function (report) {
        deepEqual(report._list, [
          [report.LOG_FORCE_PUT_REMOTE, id],
          [report.LOG_PUT_REMOTE_ATTACHMENT, id, 'foo'],
          [report.LOG_PUT_REMOTE_ATTACHMENT, id, 'foomod'],
          [report.LOG_PUT_REMOTE_ATTACHMENT, id, 'foocre']
        ]);
        ok(true, 'second repair success');

        // remote document recreated
        return context.jio.__storage._remote_sub_storage.get(id);
      })
      .then(function (result) {
        deepEqual(result, {title: "foo2"});

        // document signature modified
        return context.jio.__storage._signature_sub_storage
                      .get(id);
      })
      .then(function (result) {
        deepEqual(result, {
          from_local: true,
          hash: "9819187e39531fdc9bcfd40dbc6a7d3c78fe8dab"
        });

        // local document untouched
        return context.jio.get(id);
      })
      .then(function (result) {
        deepEqual(result, {"title": "foo2"});

        // frozen attachment untouched
        return context.jio.__storage._remote_sub_storage.getAttachment(
          id,
          "foo",
          {format: "text"}
        );
      })
      .then(function (result) {
        equal(result, "a");
        // frozen attachment signature not created
        return context.jio.__storage._signature_sub_storage
                      .getAttachment(id, "foo", {format: "json"});
      })
      .then(function (result) {
        deepEqual(result, {hash: "86f7e437faa5a7fce15d1ddcb9eaeaea377667b8"});

        // created attachment copied
        return context.jio.__storage._remote_sub_storage.getAttachment(
          id,
          "foocre",
          {format: "text"}
        );
      })
      .then(function (result) {
        equal(result, "a");
        // created attachment signature created
        return context.jio.__storage._signature_sub_storage
                      .getAttachment(id, "foocre", {format: "json"});
      })
      .then(function (result) {
        deepEqual(result, {hash: "86f7e437faa5a7fce15d1ddcb9eaeaea377667b8"});

        // modified attachment copied
        return context.jio.__storage._remote_sub_storage.getAttachment(
          id,
          "foomod",
          {format: "text"}
        );
      })
      .then(function (result) {
        equal(result, "b");
        // modified attachment signature created
        return context.jio.__storage._signature_sub_storage
                      .getAttachment(id, "foomod", {format: "json"});
      })
      .then(function (result) {
        deepEqual(result, {hash: "e9d71f5ee7c92d6dc9e92ffdad17b8bd49418f98"});

        // deleted attachment dropped
        return context.jio.__storage._remote_sub_storage.getAttachment(
          id,
          "foodel",
          {format: "text"}
        );
      })
      .fail(function (error) {
        ok(error instanceof jIO.util.jIOError);
        equal(error.status_code, 404);
        var error_message = "Cannot find attachment: " +
          id + " , foodel";
        equal(
          error.message.substring(0, error_message.length),
          error_message
        );
        // deleted attachment signature untouched
        return context.jio.__storage._signature_sub_storage
                      .getAttachment(id, "foodel", {format: "json"});
      })
      .fail(function (error) {
        ok(error instanceof jIO.util.jIOError);
        equal(error.status_code, 404);
        var error_message = "Cannot find attachment: " +
          "_replicate_b9296354cdf1dbe0046de11f57a5a24f8f6a78a8 , " +
          "jio_attachment/";
        equal(
          error.message.substring(0, error_message.length),
          error_message
        );
      })

      .fail(function (error) {
        ok(false, error);
      })
      .always(function () {
        start();
      });
  });

  test("att sig deleted when local not checked doc del resolved", function () {
    stop();
    expect(17);

    var id,
      context = this,
      blob = new Blob(['a']),
      blob2 = new Blob(['b']);

    this.jio = jIO.createJIO({
      type: "replicate",
      report_level: 1000,
      check_local_deletion: false,
      check_local_attachment_modification: true,
      check_local_attachment_creation: true,
      check_local_attachment_deletion: true,
      check_remote_attachment_modification: true,
      check_remote_attachment_creation: true,
      check_remote_attachment_deletion: true,
      local_sub_storage: {
        type: "uuid",
        sub_storage: {
          type: "memory"
        }
      },
      remote_sub_storage: {
        type: "uuid",
        sub_storage: {
          type: "memory"
        }
      }
    });

    context.jio.post({"title": "foo"})
      .then(function (result) {
        id = result;
        return RSVP.all([
          context.jio.putAttachment(id, "foo", blob),
          context.jio.putAttachment(id, "foomod", blob),
          context.jio.putAttachment(id, "foodel", blob)
        ]);
      })
      .then(function () {
        return context.jio.repair();
      })
      .then(function () {
        return RSVP.all([
          context.jio.remove(id),
          context.jio.__storage._remote_sub_storage
                               .put(id, {title: 'foo2'}),
          context.jio.__storage._remote_sub_storage
                               .putAttachment(id, "foomod", blob2),
          context.jio.__storage._remote_sub_storage
                               .putAttachment(id, "foocre", blob),
          context.jio.__storage._remote_sub_storage
                               .removeAttachment(id, "foodel")
        ]);
      })
      .then(function () {
        return context.jio.repair();
      })

      .then(function (report) {
        deepEqual(report._list, [
          [report.LOG_SKIP_LOCAL_DELETION, id],
          [report.LOG_FORCE_PUT_LOCAL, id],
          [report.LOG_PUT_LOCAL_ATTACHMENT, id, 'foo'],
          [report.LOG_PUT_LOCAL_ATTACHMENT, id, 'foomod'],
          [report.LOG_PUT_LOCAL_ATTACHMENT, id, 'foocre']
        ]);
        ok(true, 'second repair success');

        // local document recreated
        return context.jio.get(id);
      })
      .then(function (result) {
        deepEqual(result, {title: "foo2"});

        // document signature modified
        return context.jio.__storage._signature_sub_storage
                      .get(id);
      })
      .then(function (result) {
        deepEqual(result, {
          from_local: false,
          hash: "9819187e39531fdc9bcfd40dbc6a7d3c78fe8dab"
        });

        // remote document untouched
        return context.jio.__storage._remote_sub_storage.get(id);
      })
      .then(function (result) {
        deepEqual(result, {"title": "foo2"});

        // frozen attachment untouched
        return context.jio.getAttachment(
          id,
          "foo",
          {format: "text"}
        );
      })
      .then(function (result) {
        equal(result, "a");
        // frozen attachment signature not created
        return context.jio.__storage._signature_sub_storage
                      .getAttachment(id, "foo", {format: "json"});
      })
      .then(function (result) {
        deepEqual(result, {hash: "86f7e437faa5a7fce15d1ddcb9eaeaea377667b8"});

        // created attachment copied
        return context.jio.getAttachment(
          id,
          "foocre",
          {format: "text"}
        );
      })
      .then(function (result) {
        equal(result, "a");
        // created attachment signature created
        return context.jio.__storage._signature_sub_storage
                      .getAttachment(id, "foocre", {format: "json"});
      })
      .then(function (result) {
        deepEqual(result, {hash: "86f7e437faa5a7fce15d1ddcb9eaeaea377667b8"});

        // modified attachment copied
        return context.jio.getAttachment(
          id,
          "foomod",
          {format: "text"}
        );
      })
      .then(function (result) {
        equal(result, "b");
        // modified attachment signature created
        return context.jio.__storage._signature_sub_storage
                      .getAttachment(id, "foomod", {format: "json"});
      })
      .then(function (result) {
        deepEqual(result, {hash: "e9d71f5ee7c92d6dc9e92ffdad17b8bd49418f98"});

        // deleted attachment dropped
        return context.jio.getAttachment(
          id,
          "foodel",
          {format: "text"}
        );
      })
      .fail(function (error) {
        ok(error instanceof jIO.util.jIOError);
        equal(error.status_code, 404);
        var error_message = "Cannot find attachment: " +
          id + " , foodel";
        equal(
          error.message.substring(0, error_message.length),
          error_message
        );
        // deleted attachment signature untouched
        return context.jio.__storage._signature_sub_storage
                      .getAttachment(id, "foodel", {format: "json"});
      })
      .fail(function (error) {
        ok(error instanceof jIO.util.jIOError);
        equal(error.status_code, 404);
        var error_message = "Cannot find attachment: " +
          "_replicate_b9296354cdf1dbe0046de11f57a5a24f8f6a78a8 , " +
          "jio_attachment/";
        equal(
          error.message.substring(0, error_message.length),
          error_message
        );
      })

      .fail(function (error) {
        ok(false, error);
      })
      .always(function () {
        start();
      });
  });

  test("att sig deleted when remot doc not checked del resolved", function () {
    stop();
    expect(17);

    var id,
      context = this,
      blob = new Blob(['a']),
      blob2 = new Blob(['b']);

    this.jio = jIO.createJIO({
      type: "replicate",
      report_level: 1000,
      check_remote_deletion: false,
      check_local_attachment_modification: true,
      check_local_attachment_creation: true,
      check_local_attachment_deletion: true,
      check_remote_attachment_modification: true,
      check_remote_attachment_creation: true,
      check_remote_attachment_deletion: true,
      local_sub_storage: {
        type: "uuid",
        sub_storage: {
          type: "memory"
        }
      },
      remote_sub_storage: {
        type: "uuid",
        sub_storage: {
          type: "memory"
        }
      }
    });

    context.jio.post({"title": "foo"})
      .then(function (result) {
        id = result;
        return RSVP.all([
          context.jio.putAttachment(id, "foo", blob),
          context.jio.putAttachment(id, "foomod", blob),
          context.jio.putAttachment(id, "foodel", blob)
        ]);
      })
      .then(function () {
        return context.jio.repair();
      })
      .then(function () {
        return RSVP.all([
          context.jio.__storage._remote_sub_storage.remove(id),
          context.jio.put(id, {title: 'foo2'}),
          context.jio.putAttachment(id, "foomod", blob2),
          context.jio.putAttachment(id, "foocre", blob),
          context.jio.removeAttachment(id, "foodel")
        ]);
      })
      .then(function () {
        return context.jio.repair();
      })

      .then(function (report) {
        deepEqual(report._list, [
          [report.LOG_FORCE_PUT_REMOTE, id],
          [report.LOG_PUT_REMOTE_ATTACHMENT, id, 'foo'],
          [report.LOG_PUT_REMOTE_ATTACHMENT, id, 'foomod'],
          [report.LOG_PUT_REMOTE_ATTACHMENT, id, 'foocre']
        ]);
        ok(true, 'second repair success');

        // remote document recreated
        return context.jio.__storage._remote_sub_storage.get(id);
      })
      .then(function (result) {
        deepEqual(result, {title: "foo2"});

        // document signature modified
        return context.jio.__storage._signature_sub_storage
                      .get(id);
      })
      .then(function (result) {
        deepEqual(result, {
          from_local: true,
          hash: "9819187e39531fdc9bcfd40dbc6a7d3c78fe8dab"
        });

        // local document untouched
        return context.jio.get(id);
      })
      .then(function (result) {
        deepEqual(result, {"title": "foo2"});

        // frozen attachment untouched
        return context.jio.__storage._remote_sub_storage.getAttachment(
          id,
          "foo",
          {format: "text"}
        );
      })
      .then(function (result) {
        equal(result, "a");
        // frozen attachment signature not created
        return context.jio.__storage._signature_sub_storage
                      .getAttachment(id, "foo", {format: "json"});
      })
      .then(function (result) {
        deepEqual(result, {hash: "86f7e437faa5a7fce15d1ddcb9eaeaea377667b8"});

        // created attachment copied
        return context.jio.__storage._remote_sub_storage.getAttachment(
          id,
          "foocre",
          {format: "text"}
        );
      })
      .then(function (result) {
        equal(result, "a");
        // created attachment signature created
        return context.jio.__storage._signature_sub_storage
                      .getAttachment(id, "foocre", {format: "json"});
      })
      .then(function (result) {
        deepEqual(result, {hash: "86f7e437faa5a7fce15d1ddcb9eaeaea377667b8"});

        // modified attachment copied
        return context.jio.__storage._remote_sub_storage.getAttachment(
          id,
          "foomod",
          {format: "text"}
        );
      })
      .then(function (result) {
        equal(result, "b");
        // modified attachment signature created
        return context.jio.__storage._signature_sub_storage
                      .getAttachment(id, "foomod", {format: "json"});
      })
      .then(function (result) {
        deepEqual(result, {hash: "e9d71f5ee7c92d6dc9e92ffdad17b8bd49418f98"});

        // deleted attachment dropped
        return context.jio.__storage._remote_sub_storage.getAttachment(
          id,
          "foodel",
          {format: "text"}
        );
      })
      .fail(function (error) {
        ok(error instanceof jIO.util.jIOError);
        equal(error.status_code, 404);
        var error_message = "Cannot find attachment: " +
          id + " , foodel";
        equal(
          error.message.substring(0, error_message.length),
          error_message
        );
        // deleted attachment signature untouched
        return context.jio.__storage._signature_sub_storage
                      .getAttachment(id, "foodel", {format: "json"});
      })
      .fail(function (error) {
        ok(error instanceof jIO.util.jIOError);
        equal(error.status_code, 404);
        var error_message = "Cannot find attachment: " +
          "_replicate_b9296354cdf1dbe0046de11f57a5a24f8f6a78a8 , " +
          "jio_attachment/";
        equal(
          error.message.substring(0, error_message.length),
          error_message
        );
      })

      .fail(function (error) {
        ok(false, error);
      })
      .always(function () {
        start();
      });
  });

  ///////////////////////////////////////
  // Query parameter handling
  ///////////////////////////////////////
  test("local document stop matching query with attachment", function () {
    stop();
    expect(4);

    var id,
      second_id,
      context = this,
      blob = new Blob(['a']);

    this.jio = jIO.createJIO({
      type: "replicate",
      report_level: 1000,
      query: {sort_on: [['title', 'descending']], limit: [0, 1]},
      check_local_attachment_modification: true,
      check_local_attachment_creation: true,
      check_local_attachment_deletion: true,
      check_remote_attachment_modification: true,
      check_remote_attachment_creation: true,
      check_remote_attachment_deletion: true,
      local_sub_storage: {
        type: "uuid",
        sub_storage: {
          type: "query",
          sub_storage: {
            type: "memory"
          }
        }
      },
      remote_sub_storage: {
        type: "uuid",
        sub_storage: {
          type: "query",
          sub_storage: {
            type: "memory"
          }
        }
      }
    });

    context.jio.post({"title": "a"})
      .then(function (result) {
        id = result;
        return context.jio.putAttachment(id, 'foo', blob);
      })
      .then(function () {
        return context.jio.repair();
      })
      .then(function (report) {
        deepEqual(report._list, [
          [report.LOG_PUT_REMOTE, id],
          [report.LOG_PUT_REMOTE_ATTACHMENT, id, 'foo']
        ]);
        ok(true, 'first repair success');
        // Create another document, which will make the first one
        // not matching the query anymore
        // and so, will be considered as deleted
        return context.jio.post({"title": "b"});
      })
      .then(function (result) {
        second_id = result;
        return context.jio.repair();
      })

      .then(function (report) {
        deepEqual(report._list, [
          [report.LOG_PUT_REMOTE, second_id],
          [report.LOG_NO_CHANGE_ATTACHMENT, id, 'foo'],
          [report.LOG_DELETE_REMOTE, id]
        ]);
        ok(true, 'second repair success');
      })
      .fail(function (error) {
        ok(false, error);
      })
      .always(function () {
        start();
      });
  });

  test("local document stop matching query with att. conflict", function () {
    stop();
    expect(4);

    var id,
      second_id,
      context = this,
      blob = new Blob(['a']),
      blob2 = new Blob(['b']),
      blob3 = new Blob(['c']);

    this.jio = jIO.createJIO({
      type: "replicate",
      report_level: 1000,
      query: {sort_on: [['title', 'descending']], limit: [0, 1]},
      check_local_attachment_modification: true,
      check_local_attachment_creation: true,
      check_local_attachment_deletion: true,
      check_remote_attachment_modification: true,
      check_remote_attachment_creation: true,
      check_remote_attachment_deletion: true,
      local_sub_storage: {
        type: "uuid",
        sub_storage: {
          type: "query",
          sub_storage: {
            type: "memory"
          }
        }
      },
      remote_sub_storage: {
        type: "uuid",
        sub_storage: {
          type: "query",
          sub_storage: {
            type: "memory"
          }
        }
      }
    });

    context.jio.post({"title": "a"})
      .then(function (result) {
        id = result;
        return context.jio.putAttachment(id, 'foo', blob);
      })
      .then(function () {
        return context.jio.repair();
      })
      .then(function (report) {
        deepEqual(report._list, [
          [report.LOG_PUT_REMOTE, id],
          [report.LOG_PUT_REMOTE_ATTACHMENT, id, 'foo']
        ]);
        ok(true, 'first repair success');
        // Create another document, which will make the first one
        // not matching the query anymore
        // and so, will be considered as deleted
        return RSVP.all([
          context.jio.post({"title": "b"}),
          context.jio.putAttachment(id, 'foo', blob2),
          context.jio.__storage._remote_sub_storage.putAttachment(
            id,
            "foo",
            blob3
          )
        ]);
      })
      .then(function (result) {
        second_id = result[0];
        return context.jio.repair();
      })

      .fail(function (report) {
        deepEqual(report._list, [
          [report.LOG_PUT_REMOTE, second_id],
          [report.LOG_UNRESOLVED_ATTACHMENT_CONFLICT, id, 'foo'],
          [report.LOG_UNEXPECTED_REMOTE_ATTACHMENT, id]
        ]);
        ok(true, 'second repair success');
      })
      .fail(function (error) {
        ok(false, error);
      })
      .always(function () {
        start();
      });
  });

  test("local document stop matching query with att. conf. res.", function () {
    stop();
    expect(4);

    var id,
      second_id,
      context = this,
      blob = new Blob(['a']),
      blob2 = new Blob(['b']),
      blob3 = new Blob(['c']);

    this.jio = jIO.createJIO({
      type: "replicate",
      report_level: 1000,
      query: {sort_on: [['title', 'descending']], limit: [0, 1]},
      check_local_attachment_modification: true,
      check_local_attachment_creation: true,
      check_local_attachment_deletion: true,
      check_remote_attachment_modification: true,
      check_remote_attachment_creation: true,
      check_remote_attachment_deletion: true,
      conflict_handling: 2,
      local_sub_storage: {
        type: "uuid",
        sub_storage: {
          type: "query",
          sub_storage: {
            type: "memory"
          }
        }
      },
      remote_sub_storage: {
        type: "uuid",
        sub_storage: {
          type: "query",
          sub_storage: {
            type: "memory"
          }
        }
      }
    });

    context.jio.post({"title": "a"})
      .then(function (result) {
        id = result;
        return context.jio.putAttachment(id, 'foo', blob);
      })
      .then(function () {
        return context.jio.repair();
      })
      .then(function (report) {
        deepEqual(report._list, [
          [report.LOG_PUT_REMOTE, id],
          [report.LOG_PUT_REMOTE_ATTACHMENT, id, 'foo']
        ]);
        ok(true, 'first repair success');
        // Create another document, which will make the first one
        // not matching the query anymore
        // and so, will be considered as deleted
        return RSVP.all([
          context.jio.post({"title": "b"}),
          context.jio.putAttachment(id, 'foo', blob2),
          context.jio.__storage._remote_sub_storage.putAttachment(
            id,
            "foo",
            blob3
          )
        ]);
      })
      .then(function (result) {
        second_id = result[0];
        return context.jio.repair();
      })

      .then(function (report) {
        deepEqual(report._list, [
          [report.LOG_PUT_REMOTE, second_id],
          [report.LOG_FORCE_PUT_LOCAL_ATTACHMENT, id, 'foo'],
          [report.LOG_DELETE_REMOTE, id]
        ]);
        ok(true, 'second repair success');
      })
      .fail(function (error) {
        ok(false, error);
      })
      .always(function () {
        start();
      });
  });

  test("remote document stop matching query with attachment", function () {
    stop();
    expect(4);

    var id,
      second_id,
      context = this,
      blob = new Blob(['a']);

    this.jio = jIO.createJIO({
      type: "replicate",
      report_level: 1000,
      query: {sort_on: [['title', 'descending']], limit: [0, 1]},
      check_local_attachment_modification: true,
      check_local_attachment_creation: true,
      check_local_attachment_deletion: true,
      check_remote_attachment_modification: true,
      check_remote_attachment_creation: true,
      check_remote_attachment_deletion: true,
      local_sub_storage: {
        type: "uuid",
        sub_storage: {
          type: "query",
          sub_storage: {
            type: "memory"
          }
        }
      },
      remote_sub_storage: {
        type: "uuid",
        sub_storage: {
          type: "query",
          sub_storage: {
            type: "memory"
          }
        }
      }
    });

    context.jio.post({"title": "a"})
      .then(function (result) {
        id = result;
        return context.jio.putAttachment(id, 'foo', blob);
      })
      .then(function () {
        return context.jio.repair();
      })
      .then(function (report) {
        deepEqual(report._list, [
          [report.LOG_PUT_REMOTE, id],
          [report.LOG_PUT_REMOTE_ATTACHMENT, id, 'foo']
        ]);
        ok(true, 'first repair success');
        // Create another document, which will make the first one
        // not matching the query anymore
        // and so, will be considered as deleted
        return context.jio.__storage._remote_sub_storage.post({"title": "b"});
      })
      .then(function (result) {
        second_id = result;
        return context.jio.repair();
      })

      .then(function (report) {
        deepEqual(report._list, [
          [report.LOG_PUT_LOCAL, second_id],
          [report.LOG_NO_CHANGE_ATTACHMENT, id, 'foo'],
          [report.LOG_DELETE_LOCAL, id]
        ]);
        ok(true, 'second repair success');
      })
      .fail(function (error) {
        ok(false, error);
      })
      .always(function () {
        start();
      });
  });

  test("remote document stop matching query with att. conflict", function () {
    stop();
    expect(4);

    var id,
      second_id,
      context = this,
      blob = new Blob(['a']),
      blob2 = new Blob(['b']),
      blob3 = new Blob(['c']);

    this.jio = jIO.createJIO({
      type: "replicate",
      report_level: 1000,
      query: {sort_on: [['title', 'descending']], limit: [0, 1]},
      check_local_attachment_modification: true,
      check_local_attachment_creation: true,
      check_local_attachment_deletion: true,
      check_remote_attachment_modification: true,
      check_remote_attachment_creation: true,
      check_remote_attachment_deletion: true,
      local_sub_storage: {
        type: "uuid",
        sub_storage: {
          type: "query",
          sub_storage: {
            type: "memory"
          }
        }
      },
      remote_sub_storage: {
        type: "uuid",
        sub_storage: {
          type: "query",
          sub_storage: {
            type: "memory"
          }
        }
      }
    });

    context.jio.post({"title": "a"})
      .then(function (result) {
        id = result;
        return context.jio.putAttachment(id, 'foo', blob);
      })
      .then(function () {
        return context.jio.repair();
      })
      .then(function (report) {
        deepEqual(report._list, [
          [report.LOG_PUT_REMOTE, id],
          [report.LOG_PUT_REMOTE_ATTACHMENT, id, 'foo']
        ]);
        ok(true, 'first repair success');
        // Create another document, which will make the first one
        // not matching the query anymore
        // and so, will be considered as deleted
        return RSVP.all([
          context.jio.__storage._remote_sub_storage.post({"title": "b"}),
          context.jio.putAttachment(id, 'foo', blob2),
          context.jio.__storage._remote_sub_storage.putAttachment(
            id,
            "foo",
            blob3
          )
        ]);
      })
      .then(function (result) {
        second_id = result[0];
        return context.jio.repair();
      })

      .fail(function (report) {
        deepEqual(report._list, [
          [report.LOG_PUT_LOCAL, second_id],
          [report.LOG_UNRESOLVED_ATTACHMENT_CONFLICT, id, 'foo'],
          [report.LOG_UNEXPECTED_LOCAL_ATTACHMENT, id]
        ]);
        ok(true, 'second repair success');
      })
      .fail(function (error) {
        ok(false, error);
      })
      .always(function () {
        start();
      });
  });

  test("remote document stop matching query with att. conf. res.", function () {
    stop();
    expect(4);

    var id,
      second_id,
      context = this,
      blob = new Blob(['a']),
      blob2 = new Blob(['b']),
      blob3 = new Blob(['c']);

    this.jio = jIO.createJIO({
      type: "replicate",
      report_level: 1000,
      query: {sort_on: [['title', 'descending']], limit: [0, 1]},
      check_local_attachment_modification: true,
      check_local_attachment_creation: true,
      check_local_attachment_deletion: true,
      check_remote_attachment_modification: true,
      check_remote_attachment_creation: true,
      check_remote_attachment_deletion: true,
      conflict_handling: 1,
      local_sub_storage: {
        type: "uuid",
        sub_storage: {
          type: "query",
          sub_storage: {
            type: "memory"
          }
        }
      },
      remote_sub_storage: {
        type: "uuid",
        sub_storage: {
          type: "query",
          sub_storage: {
            type: "memory"
          }
        }
      }
    });

    context.jio.post({"title": "a"})
      .then(function (result) {
        id = result;
        return context.jio.putAttachment(id, 'foo', blob);
      })
      .then(function () {
        return context.jio.repair();
      })
      .then(function (report) {
        deepEqual(report._list, [
          [report.LOG_PUT_REMOTE, id],
          [report.LOG_PUT_REMOTE_ATTACHMENT, id, 'foo']
        ]);
        ok(true, 'first repair success');
        // Create another document, which will make the first one
        // not matching the query anymore
        // and so, will be considered as deleted
        return RSVP.all([
          context.jio.__storage._remote_sub_storage.post({"title": "b"}),
          context.jio.putAttachment(id, 'foo', blob2),
          context.jio.__storage._remote_sub_storage.putAttachment(
            id,
            "foo",
            blob3
          )
        ]);
      })
      .then(function (result) {
        second_id = result[0];
        return context.jio.repair();
      })

      .then(function (report) {
        deepEqual(report._list, [
          [report.LOG_PUT_LOCAL, second_id],
          [report.LOG_FORCE_PUT_REMOTE_ATTACHMENT, id, 'foo'],
          [report.LOG_DELETE_LOCAL, id]
        ]);
        ok(true, 'second repair success');
      })
      .fail(function (error) {
        ok(false, error);
      })
      .always(function () {
        start();
      });
  });

}(jIO, QUnit, Blob, RSVP));