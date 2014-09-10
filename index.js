(function() { 'use strict';

/**
 * @ngdoc module
 * @name anotherpit/angular-media
 * @author anotherpit <anotherpit@gmail.com>
 */
var module = angular.module('anotherpit/angular-media', ['ng']);
module.minErr = angular.$$minErr(module.name);

/**
 * @ngdoc type
 * @name MediaController
 */
MediaController.$inject = ['$element', '$q', '$timeout'];
function MediaController($element, $q, $timeout) {
    var self = this;
    self.$$q = $q;
    self.$$timeout = $timeout;
    self.$$element = $element;
    self.$$dom = $element[0];
    self.defaultVolume = self.getVolume();

    self.on('timeupdate', self.$$updateCurrentTime.bind(self))
        .on('durationchange', self.$$updateBufferedTime.bind(self))
        .on('progress', self.$$updateBufferedTime.bind(self));

    self.$$q.when()
        .then(function() {
            return self.setSrc(self.getSrc());
        })
        .then(function() {
            return self.setCurrentTime(0);
        })
        .then(function() {
            self.$$isReady = true;
            self.$$element.triggerHandler('$ready');
            return true;
        })
        ['catch'](function(e) {
            throw e;
        });
}

angular.extend(MediaController.prototype, {
    defaultVolume: .5,
    defaultTimeout: 1000,

    /**
     * @returns this
     */
    on: function() {
        this.$$element.on.apply(this.$$element, arguments);
        return this;
    },

    /**
     * @returns this
     */
    one: function() {
        this.$$element.one.apply(this.$$element, arguments);
        return this;
    },

    /**
     * @returns this
     */
    off: function() {
        this.$$element.off.apply(this.$$element, arguments);
        return this;
    },

    /**
     * Returns promise on newly created deferred task
     * which is resolved on some native event on underlying DOM element,
     * or is rejected on specified timeout.
     *
     * @param {function} checkFn If returns true, the deffered'll be resolved immediately
     * @param {function} runFn Main task function
     * @param {string} resolveEvent Name of native event, which resolves the promise
     * @param {function} resolveFn Function whose return value is used to resolve the deferred
     * @param {number} [timeout=this.defaultTimeout] Timeout in ms to reject the deferred, -1 for no timeout
     *
     * @returns {Promise}
     * @resolves {*} Whatever resolveFn() returns
     * @rejects {Error} Error on timeout or runFn
     */
    $$defer: function(checkFn, runFn, resolveEvent, resolveFn, timeout) {
        var self = this;
        if (checkFn.call(self)) {
            return self.$$q.when(resolveFn.call(self));
        }
        var deferred = self.$$q.defer();
        var promise = deferred.promise;

        var pending;
        timeout = timeout || this.defaultTimeout;
        if (timeout > 0) {
            pending = self.$$timeout(onTimeout, timeout);
        }
        function onTimeout() {
            self.off(resolveEvent, onEvent);
            deferred.reject(module.minErr('MediaController', 'Timeout reached on `{0}` event', resolveEvent));
        }

        // For unknown reason self.one() doesn't work here,
        // so use explicit self.on()/self.off()
        self.on(resolveEvent, onEvent);
        function onEvent() {
            self.off(resolveEvent, onEvent);
            self.$$timeout.cancel(pending);
            deferred.resolve(resolveFn.call(self));
        }

        // try {
           runFn.call(self);
        // } catch (e) {
        //     deferred.reject(e);
        // }
        return promise;
    },

    /**
     * Start playback
     *
     * @returns {Promise}
     * @resolves {number} Current time
     * @rejects {Error}
     */
    play: function() {
        return this.$$defer(
            function() {
                return !this.$$dom.paused && !this.$$dom.ended;
            },
            function() {
                this.$$dom.play();
            },
            'playing',
            function() {
                this.getCurrentTime();
            }
        );
    },

    /**
     * Pause playback
     *
     * @returns {Promise}
     * @resolves {number} Current time
     * @rejects {Error}
     */
    pause: function() {
        return this.$$defer(
            function() {
                return this.$$dom.paused;
            },
            function() {
                this.$$dom.pause();
            },
            'pause',
            function() {
                this.getCurrentTime();
            }
        );
    },

    /**
     * Load media
     *
     * @returns {Promise}
     * @resolves {number} Duration
     * @rejects {Error}
     */
    load: function() {
        // Debug. Emulate iOS refusal to init
        // media load without the user's interaction
        // if (!this.$$skipped) {
        //     this.$$skipped = true;
        //     return this.$$q.reject('smth');
        // }

        return this.$$defer(
            function() {
                return this.$$bufferedTime;
            },
            function() {
                this.$$dom.load();
            },
            'loadedmetadata',
            function() {
                this.getDuration();
            },
            20000
        );
    },

    /**
     * @returns {number} Video duration in seconds
     */
    getDuration: function() {
        return this.$$dom.duration || Number.NaN;
    },

    /**
     * @returns {number} The rightmost loaded time in seconds
     */
    getBufferedTime: function() {
        return this.$$bufferedTime || 0;
    },

    $$updateCurrentTime: function() {
        var self = this;
        self.$$currentTime = self.$$dom.currentTime;
        self.$$timeout(function() {});
    },

    $$updateBufferedTime: function() {
        var self = this;
        var buffered = self.$$dom.buffered;
        self.$$bufferedTime = buffered
            && buffered.length
            && buffered.end(buffered.length - 1)
            || 0;
        self.$$timeout(function() {});
    },

    /**
     * @returns {number} Current playback time in seconds
     */
    getCurrentTime: function() {
        return this.$$currentTime || 0;
    },

    /**
     * Seek time position
     *
     * @param {number} Time in seconds
     * @returns {Promise}
     * @resolves {number} Current time
     * @rejects {Error}
     */
    setCurrentTime: function(currentTime) {
        return this.$$defer(
            function() {
                return currentTime === this.getCurrentTime();
            },
            function() {
                this.$$dom.currentTime = currentTime;
                this.$$currentTime = currentTime; // Optimistic
            },
            'seeked',
            function() {
                return this.getCurrentTime();
            },
            20000
        );
    },

    /**
     * @returns {bool}
     */
    isSeeking: function() {
        return !!this.$$dom.seeking;
    },

    /**
     * @returns {bool}
     */
    isPaused: function() {
        return !!this.$$dom.paused;
    },

    /**
     * @returns {bool}
     */
    isEnded: function() {
        return !!this.$$dom.ended;
    },

    /**
     * @returns {number} [0;1]
     */
    getVolume: function() {
        return this.$$dom.volume;
    },

    /**
     * Set volume
     *
     * @param {number} Volume [0;1]
     * @returns {Promise}
     * @resolves {number} Volume
     * @rejects {Error}
     */
    setVolume: function(volume) {
        return this.$$defer(
            function() {
                return volume === this.getVolume();
            },
            function() {
                if (!volume) {
                    this.defaultVolume = this.getVolume();
                }
                this.$$dom.volume = volume;
                this.$$dom.muted = !volume;
            },
            'volumechange',
            function() {
                return this.getVolume();
            }
        );
    },

    /**
     * @returns {bool}
     */
    isMuted: function() {
        return this.$$dom.muted || !this.$$dom.volume;
    },

    /**
     * Set muted
     *
     * @param {bool}
     * @returns {Promise}
     * @resolves {number} Volume
     * @rejects {Error}
     */
    setMuted: function(bool) {
        return this.setVolume(bool ? 0 : this.defaultVolume);
    },

    /**
     * @returns {bool}
     */
    isReady: function() {
        return this.$$isReady || false;
    },

    /**
     * @return {Promise}
     * @resolves {bool} TRUE when player got ready
     * @rejects {Error}
     */
    whenReady: function() {
        return this.$$defer(
            function() {
                return this.isReady();
            },
            function() {
            },
            '$ready',
            function() {
                return true;
            },
            -1
        );
    },

    /**
     * @returns {string}
     */
    getSrc: function() {
        return this.$$dom.currentSrc;
    },

    /**
     * Set source URL
     *
     * @param {string} src New URL
     * @param {string} [type] MIME type
     * @returns {Promise}
     * @resolves {string} Applied source URL
     * @rejects {Error}
     */
    setSrc: function(src, type) {
        return this.$$defer(
            function() {
                return src === this.getSrc();
            },
            function() {
                if (type) {
                    this.$$dom.setAttribute('type', type);
                }
                this.$$bufferedTime = undefined;
                this.$$currentTime = undefined;
                this.$$dom.src = src;
            },
            'loadstart',
            function() {
                return this.getSrc();
            }
        );
    }
});

module.controller('MediaController', MediaController);

}());
