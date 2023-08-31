/**
 * @file MMM-soccer.js
 *
 * @authors lavolp3 and fewieden
 * @license MIT
 *
 * @see  https://github.com/lavolp3/MMM-soccer
 */

/* jshint esversion: 6 */

/* global Module Log */

Module.register('MMM-soccer', {

    defaults: {
        api_key: false,
        colored: false,
      	width: 400,
        show: ['BL1', 'CL', 'PL'],
        updateInterval: 30,
        apiCallInterval: 10 * 60,
        focus_on: false,
        fadeFocus: true,
        max_teams: false,
        logos: true,
        showTables: true,
        showMatches: true,
        showMatchDay: true,
        matchType: 'league',    //choose 'next', 'daily', or 'league'
        numberOfNextMatches: 8,
        leagues: {
            GERMANY: 'BL1',
            FRANCE: 'FL1',
            ENGLAND: 'PL',
            SPAIN: 'PD',
            ITALY: 'SA'
        },
        view: 'standard',  //choose 'standard', 'short' or 'long'
        daysOffset: 0,
        debug: false,
    },

    modals: {
        standings: false,
        help: false
    },

    voice: {
        mode: 'SOCCER',
        sentences: [
            'OPEN HELP',
            'CLOSE HELP',
            'SHOW STANDINGS OF COUNTRY NAME',
            'EXPAND VIEW',
            'COLLAPSE VIEW'
        ]
    },

    loading: true,
    tables: {},
    matches: {},
    teams: {},
    matchDay: "",
    leagues: [],
    liveMode: false,
    liveMatches: [],
    liveLeagues: [],
    /*replacements: {
        default: {}
    },*/
    competition: '',


    start: function() {
        Log.info(`Starting module: ${this.name}`);
        this.addFilters();
        this.leagues = this.config.show;
        this.competition = this.leagues[0];
        var self = this;
        /*this.replacers = this.loadReplacements(response => {
            self.replacements = JSON.parse(response);
            //self.log(self.replacements);
        });*/
        this.sendSocketNotification('GET_SOCCER_DATA', this.config);
        this.scheduleDOMUpdates();
    },


    /*loadReplacements: function(callback) {
        this.log("Loading replacements file");
        var xobj = new XMLHttpRequest();
        var path = this.file('replacements.json');
        xobj.overrideMimeType("application/json");
        xobj.open("GET", path, true);
        xobj.onreadystatechange = function() {
            if (xobj.readyState === 4 && xobj.status === 200) {
                callback(xobj.responseText);
            }
        };
        xobj.send(null);
    },*/


    scheduleDOMUpdates: function () {
        var count = 0;
        var self = this;
        setInterval(() => {
            const comps = self.leagues.length;
            count = (count >= comps - 1) ? 0 : count + 1;
            self.competition = self.leagues[count];
            self.log("Showing competition: " + self.competition);
            self.log(self.tables[self.competition]);
            self.standing = self.filterTables(self.tables[self.competition], self.config.focus_on[self.competition]);
            self.updateDom(500);
        }, this.config.updateInterval * 1000);
    },


    socketNotificationReceived: function(notification, payload) {
        this.log(`received a Socket Notification: ${notification}`);
        if (notification === 'TABLES') {
            this.log(payload);
            this.tables = payload;
            this.standing = this.filterTables(this.tables[this.competition], this.config.focus_on[this.competition]);
            this.log("Current table: " + JSON.stringify(this.standing));
        } else if (notification === 'MATCHES') {
            this.matches = payload;
            this.log("Received matches: "+this.matches);
        } else if (notification === 'TEAMS') {
            this.teams = payload;
        /*} else if (notification === 'LIVE_MATCHES') {
            var matches = payload;*/
        } else if (notification === 'LIVE') {
            this.liveMode = payload.live;
            this.leagues = (payload.leagues.length > 0) ? payload.leagues : this.config.show;
            this.liveMatches = payload.matches;
        }
        if (this.loading === true && this.tables.hasOwnProperty(this.competition) && this.matches.hasOwnProperty(this.competition)) {
            this.loading = false;
            this.updateDom();
        }
    },

    notificationReceived: function(notification, payload, sender) {
        if (notification === 'ALL_MODULES_STARTED') {
            const voice = Object.assign({}, this.voice);
            voice.sentences.push(Object.keys(this.config.leagues).join(' '));
            this.sendNotification('REGISTER_VOICE_MODULE', voice);
        } else if (notification === 'VOICE_SOCCER' && sender.name === 'MMM-voice') {
            this.checkCommands(payload);
        } else if (notification === 'VOICE_MODE_CHANGED' && sender.name === 'MMM-voice' && payload.old === this.voice.mode) {
            this.closeAllModals();
            this.updateDom(500);
        }
    },

    getStyles: function() {
        return ['MMM-soccer.css'];
    },

    getTranslations: function() {
        return {
            en: 'translations/en.json',
            de: 'translations/de.json',
            id: 'translations/id.json',
            sv: 'translations/sv.json',
            fr: 'translations/fr.json'
        };
    },

    getTemplate: function() {
        return 'MMM-soccer.njk';
    },


    getTemplateData: function() {
        return {
            boundaries: (this.tables.hasOwnProperty(this.competition)) ? this.calculateTeamDisplayBoundaries(this.competition) : {},
            matchHeader: this.getMatchHeader(),
            config: this.config,
            isModalActive: this.isModalActive(),
            modals: this.modals,
            table: this.standing,
            comps: (Object.keys(this.matches).length > 0) ? this.prepareMatches(this.matches, this.config.focus_on[this.competition]) : "",
            showTable: (this.config.showTables && (!isNaN(this.matchDay))),
            teams: (Object.keys(this.tables).length > 0) ? this.teams : {},
            showMatchDay: this.config.showMatchDay,
            voice: this.voice
        };
    },

    getMatchHeader: function() {
        if (this.config.matchType == "daily") {
            return {
                competition: this.translate('TODAYS_MATCHES'),
                season: (Object.keys(this.tables).length > 0) ? "" : this.translate('LOADING'),
            }
        } else if (this.config.matchType == "next") {
            return {
                competition: this.translate('NEXT_MATCHES'),
                season: (Object.keys(this.tables).length > 0) ? "" : this.translate('LOADING'),
            }
        }
        return {
            competition: (Object.keys(this.tables).length > 0) ? this.tables[this.competition].competition.name : "",
            season: (Object.keys(this.tables).length > 0) ? `${this.translate('MATCHDAY')}: ${this.translate(this.matchDay)}` : this.translate('LOADING'),
        }
    },


    prepareMatches: function(allMatches, focusTeam) {
        var returnedMatches = [];
        if (this.config.matchType === 'league') {
            var diff = 0;
            var matches = allMatches[this.competition].matches;
            var minDiff = Math.abs(moment().diff(matches[0].utcDate));
            for (var m = 0; m < matches.length; m++) {
                if (!matches[m].matchday) { matches[m].matchday = matches[m].stage; }  //for cup modes, copy stage to matchday property
                diff = Math.abs(moment().diff(matches[m].utcDate));
                if (diff < minDiff) {
                    minDiff = diff;
                    this.matchDay = matches[m].matchday;
                }
            }
            this.log("Current matchday: " + this.matchDay);
            returnedMatches.push({
                competition: (Object.keys(this.tables).length > 0) ? this.tables[this.competition].competition.name : "",
                emblem: (Object.keys(this.tables).length > 0) ? this.tables[this.competition].competition.emblem : "",
                season: (Object.keys(this.tables).length > 0) ? `${this.translate('MATCHDAY')}: ${this.translate(this.matchDay)}` : this.translate('LOADING'),
                matches: matches.filter(match => {
                    return match.matchday == this.matchDay;
                })
            });
        } else if (this.config.matchType === 'next') {
            var teams = [];
            var nextMatches = [];
            for (var comp in this.config.focus_on) {
                teams.push(this.config.focus_on[comp]);
            }
            for (var league in allMatches) {
                filteredMatches = allMatches[league].matches.filter(match => {
                    return (teams.includes(match.homeTeam.name) || teams.includes(match.awayTeam.name));
                });
                var index = filteredMatches.findIndex(match => {
                    return (parseInt(moment(match.utcDate).format("X")) > parseInt(moment().format("X")));
                });
                for (var i = index - 1; i < filteredMatches.length; i++) {
                    nextMatches.push(filteredMatches[i]);
                }
            }
            nextMatches.sort(function (match1, match2) {
                return (moment(match1.utcDate) - moment(match2.utcDate));
            });
            returnedMatches.push({
                competition: this.translate('NEXT_MATCHES'),
                season: (Object.keys(this.tables).length > 0) ? "" : this.translate('LOADING'),
                matches: nextMatches.slice(0, this.config.numberOfNextMatches)
            });

        } else if (this.config.matchType === 'daily') {
            var today = moment().subtract(this.config.daysOffset, 'days');
            var todaysMatches = [];
            for (var league in allMatches) {
                var filteredMatches = allMatches[league].matches.filter(match => {
                    return ( moment(match.utcDate).isSame(today, 'day') );
                });
                this.log("Filtered macthes: ");
                this.log(filteredMatches);
                if (filteredMatches.length) {
                    returnedMatches.push({
                        competition: (Object.keys(this.tables).length > 0) ? this.tables[league].competition.name : "",
                        season: (Object.keys(this.tables).length > 0) ? "" : this.translate('LOADING'),
                        matches: filteredMatches
                    });
                }
            }
            /*todaysMatches = todaysMatches.flat();
            todaysMatches.sort(function (match1, match2) {
                return (match1.season.id - match2.season.id);
            });
            returnedMatches.push({
                competition: this.translate('TODAYS_MATCHES'),
                season: (Object.keys(this.tables).length > 0) ? "" : this.translate('LOADING'),
                matches: todaysMatches
            });*/
        }
        returnedMatches.forEach(matchset => {
            matchset.matches.forEach(match => {
                if (this.config.matchType == "league" || this.config.matchType == "daily") {
                    match.focused = (match.homeTeam.name === focusTeam) ? true : (match.awayTeam.name === focusTeam) ? true : false;
                }
                if (match.status == "TIMED" || match.status == "SCHEDULED" || match.status == "POSTPONED") {
                    match.state = (moment(match.utcDate).diff(moment(), 'days') > 7) ? moment(match.utcDate).format("D.MM.") : (moment(match.utcDate).startOf('day') > moment()) ? moment(match.utcDate).format("dd HH:mm") : moment(match.utcDate).format("LT");
               } else {
                    match.state = match.score.fullTime.home + " - " + match.score.fullTime.away;
                    if (match.score.winner == "HOME_TEAM") {
                        match.homeTeam["status"] = "winner"
                    } else if (match.score.winner == "AWAY_TEAM") {
                        match.awayTeam["status"] = "winner"
                   }
                }
            });
        });
        this.log("Returned matches:");
        this.log(returnedMatches);
        return returnedMatches;
    },


    filterTables: function(tables, focusTeam) {
        //filtering out "home" and "away" tables
        if (tables && !tables.standings) return "";
        tableArray = tables.standings.filter(table => {
            return table.type === "TOTAL";
        });
        if (tableArray[0].group === "GROUP_A" && this.config.focus_on.hasOwnProperty(tables.competition.code)) {			//cup mode
            for (var t = 0; t < tableArray.length; t++) {
                for (var n = 0; n < tableArray[t].table.length; n++) {
                    if (tableArray[t].table[n].team.name === focusTeam) {
                        table = tableArray[t].table;
                    }
                }
            }
        } else {
            table = tableArray[0].table;
        }
        return table;
    },


    findFocusTeam: function() {
        this.log("Finding focus team for table...");
        let focusTeamIndex = -1;
        var table = this.standing;
        for (let i = 0; i < table.length; i ++) {
            if (table[i].team.name === this.config.focus_on[this.competition]) {
                focusTeamIndex = i;
                this.log("Focus Team found: " + table[i].team.name);
                break;
            }
        }

        if (focusTeamIndex < 0) {
            this.log("No Focus Team found! Please check your entry!");
            return {
                focusTeamIndex: -1,
                firstTeam: 0,
                lastTeam: this.config.max_teams || this.standing.length
            };
        } else {
            const { firstTeam, lastTeam } = this.getFirstAndLastTeam(focusTeamIndex);
            return { focusTeamIndex, firstTeam, lastTeam };
        }
    },


    getFirstAndLastTeam: function(index) {
        let firstTeam;
        let lastTeam;

        if (this.config.max_teams) {
            const before = parseInt(this.config.max_teams / 2);
            firstTeam = (index - before >= 0) ? (index - before) : 0;
            if (firstTeam + this.config.max_teams <= this.standing.length) {
                lastTeam = firstTeam + this.config.max_teams;
            } else {
                lastTeam = this.standing.length;
                /*firstTeam = lastTeam - this.config.max_teams >= 0 ?
                    lastTeam - this.config.max_teams : 0;*/
            }
        } else {
            firstTeam = 0;
            lastTeam = this.standing.length;
        }
        this.log({firstTeam, lastTeam});
        return { firstTeam, lastTeam };
    },


    calculateTeamDisplayBoundaries: function(competition) {
        this.log("Calculating Team Display Boundaries");
        if (this.config.focus_on && this.config.focus_on.hasOwnProperty(competition)) {
            if (this.config.focus_on[competition] === 'TOP') {
                this.log("Focus on TOP");
                return {
                    focusTeamIndex: -1,
                    firstTeam: 0,
                    lastTeam: this.isMaxTeamsLessAll() ? this.config.max_teams : this.standing.length
                };
            } else if (this.config.focus_on[this.leagues] === 'BOTTOM') {
                this.log("Focus on BOTTOM");
                return {
                    focusTeamIndex: -1,
                    firstTeam: this.isMaxTeamsLessAll() ? this.standing.length - this.config.max_teams : 0,
                    lastTeam: this.standing.length
                };
            }
            this.log("Focus on Team");
            return this.findFocusTeam();
        }

        return {
            focusTeamIndex: -1,
            firstTeam: 0,
            lastTeam: this.config.max_teams || this.standing.length
        };
    },



    isMaxTeamsLessAll: function() {
        return (this.config.max_teams && this.config.max_teams <= this.standing.length);
    },


    handleModals: function(data, modal, open, close) {
        if (close.test(data) || (this.modals[modal] && !open.test(data))) {
            this.closeAllModals();
        } else if (open.test(data) || (!this.modals[modal] && !close.test(data))) {
            this.closeAllModals();
            this.modals[modal] = true;
        }

        const modules = document.querySelectorAll('.module');
        for (let i = 0; i < modules.length; i += 1) {
            if (!modules[i].classList.contains('MMM-soccer')) {
                if (this.isModalActive()) {
                    modules[i].classList.add('MMM-soccer-blur');
                } else {
                    modules[i].classList.remove('MMM-soccer-blur');
                }
            }
        }
    },


    closeAllModals: function() {
        const modals = Object.keys(this.modals);
        modals.forEach((modal) => { this.modals[modal] = false; });
    },


    isModalActive: function() {
        const modals = Object.keys(this.modals);
        return modals.some(modal => this.modals[modal] === true);
    },


    checkCommands: function(data) {
        if (/(HELP)/g.test(data)) {
            this.handleModals(data, 'help', /(OPEN)/g, /(CLOSE)/g);
        } else if (/(VIEW)/g.test(data)) {
            this.handleModals(data, 'standings', /(EXPAND)/g, /(COLLAPSE)/g);
        } else if (/(STANDINGS)/g.test(data)) {
            const countrys = Object.keys(this.config.leagues);
            for (let i = 0; i < countrys.length; i += 1) {
                const regexp = new RegExp(countrys[i], 'g');
                if (regexp.test(data)) {
                    this.closeAllModals();
                    if (this.currentLeague !== this.config.leagues[countrys[i]]) {
                        this.currentLeague = this.config.leagues[countrys[i]];
                        this.getData();
                    }
                    break;
                }
            }
        }
        this.updateDom(300);
    },


    addFilters: function () {
        njEnv = this.nunjucksEnvironment();
        njEnv.addFilter('fade', (index, focus) => {
            if (this.config.max_teams && this.config.fadeFocus && focus >= 0) {
                if (index !== focus) {
                    const currentStep = Math.abs(index - focus);
                    return `opacity: ${1 - ((1 / this.config.max_teams) * currentStep)}`;
                }
            }
            return '';
        });

        njEnv.addFilter('replace', (team) => {
            var view = this.config.view;
            switch (view) {
                case 'long': return team.name;
                case 'short': return team.tla;
                default: return team.shortName
            }
        });
    },

    log: function (msg) {
        if (this.config && this.config.debug) {
            console.log(this.name + ":", JSON.stringify(msg));
        }
    },
});
