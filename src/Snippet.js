"use strict";
var Parse = require('./Parse');
var SnippetRevision = require('./SnippetRevision');
var snippetQuery;
var cache = {};
global.__cache = cache;

function getIDAndRevisionFromHash() {
  var match = global.location.hash.match(/^#\/([^\/]+)(?:\/(\d*))?/);
  if (match) {
    return {
      id: match[1],
      rev: match[2] || 0
    };
  }
  return null;
}

function getFromCache(snippetID, rev) {
  var cacheEntry = cache[snippetID];
  return {
    snippet: cacheEntry && cacheEntry.snippet || null,
    revision: cacheEntry && cacheEntry[rev] || null
  };
}

function setInCache(snippet, revision,rev) {
  var cacheEntry = cache[snippet.id] || (cache[snippet.id] = {});
  cacheEntry.snippet = snippet;
  cacheEntry[rev] = revision;
}

var Snippet = Parse.Object.extend('Snippet', {
  fetchLatestRevision: function() {
    if (this._latestRevision) {
      return Parse.Promise.as(this._latestRevision);
    } else {
      var revisions = this.get('revisions');
      if (!revisions || revisions.length === 0) {
        return Parse.Promise.as(null);
      }
      return revisions[revisions.length - 1].fetch(function(revision) {
        this._latestRevision = revision;
      }.bind(this));
    }
  },
  createNewRevision: function(data) {
    // we only create a new revision if the code is different from the previous
    // revision
    return this.fetchLatestRevision().then(function(revision) {
      if (!revision  || revision.get('code') !== data.code) {
        var newRevision = new SnippetRevision();
        newRevision.set('code', data.code);
        this.add('revisions', newRevision);
        return this.save().then(function(snippet) {
          var revisionNumber = snippet.get('revisions').length - 1;
          this._latestRevision = newRevision;
          setInCache(snippet, newRevision, revisionNumber);
          return {
            snippet: snippet,
            revision: newRevision,
            revisionNumber: revisionNumber
          };
        }.bind(this));
      }
      return null;
    }.bind(this));
  }
}, {
  fetch: function(snippetID, rev) {
    if (!snippetQuery) {
      snippetQuery = new Parse.Query(Snippet);
    }
    var cacheEntry = getFromCache(snippetID, rev);
    if (cacheEntry.snippet && cacheEntry.revision) {
      return Parse.Promise.as(cacheEntry);
    } else if(cacheEntry.snippet) {
      return cacheEntry.snippet.get('revisions')[rev].fetch().then(
        function(revision) {
          setInCache(cacheEntry.snippet, revision, rev);
          return {snippet: cacheEntry.snippet, revision: revision};
        }
      );
    } else {
      return snippetQuery.get(snippetID).then(function(snippet) {
        return snippet.get('revisions')[rev].fetch().then(function(revision) {
          setInCache(snippet, revision, rev);
          return {snippet: snippet, revision: revision};
        });
      });
    }
  },

  fetchFromURL: function() {
    var urlParameters = getIDAndRevisionFromHash();
    if (urlParameters) {
      return Snippet.fetch(urlParameters.id, urlParameters.rev).then(
        function(data) {
          data.revisionNumber = urlParameters.rev;
          return data;
        }
      );
    }
    return Parse.Promise.as(null);
  },
});

module.exports = Snippet;
