

define([], function () {
    'use strict';

    var DOT_SPACING  = 40;   
    var DOT_PAD_PX   = 0;    
    var STEPS_PS    = 3.5;
    var MS_PER_STEP = 1000 / STEPS_PS;
    var BASE_R      = 1;
    var GAME_DURATION_MS = 90 * 1000;

    var _CELL = 40;  // = DOT_SPACING (alias used by rendering)
    var _offX = 0;
    var _offY = 0;

    var PALETTE = [
        { head: '#0a2a6e', fill: '#1e5abf' },   
        { head: '#6b0a08', fill: '#b52a1a' },   
        { head: '#094a1c', fill: '#1a8c40' },   
        { head: '#380860', fill: '#7020b0' },  
        { head: '#5c1e00', fill: '#b04010' },   
    ];

    var _canvas = null, _ctx = null;
    var _W = 0, _H = 0, _COLS = 0, _ROWS = 0;
    var _terr = null;
    var _players = [], _localIdx = 0;
    var _isShared = false, _presenceSend = null;
    var _rafId = null, _lastT = 0;
    var _running = false, _gameOver = false, _waitStart = true;
    var _gameStartT = 0, _timeLeftMs = GAME_DURATION_MS;
    var _winReason = '';    // text to show on game-over card
    var _nextDc = 0, _nextDr = 0, _dirPending = false;
    var _onKey = null, _onPtr = null, _onTouch = null;
    var _spawns = [];
    var _localColor = null;   // last color set via setColor(); re-applied after every reset


    function _buildSpawns() {
        var mc = Math.floor(_COLS/2), mr = Math.floor(_ROWS/2);
        _spawns = [
            { gc: BASE_R+1,       gr: mr,              dc:  1, dr:  0 },
            { gc: _COLS-BASE_R-2, gr: mr,              dc: -1, dr:  0 },
            { gc: mc,             gr: BASE_R+1,         dc:  0, dr:  1 },
            { gc: mc,             gr: _ROWS-BASE_R-2,  dc:  0, dr: -1 },
            { gc: BASE_R+1,       gr: BASE_R+1,         dc:  1, dr:  0 },
        ];
    }


    function _makePlayer(idx, isAI) {
        var sp  = _spawns[idx % _spawns.length];
        var pal = PALETTE[idx % PALETTE.length];
        return {
            index:    idx,
            head:     pal.head,
            fill:     pal.fill,
            isAI:     isAI,
            gc: sp.gc, gr: sp.gr,
            dc: isAI ? sp.dc : 0,
            dr: isAI ? sp.dr : 0,
            trail:    [],
            trailSet: {},
            outside:  false,
            alive:    true,
            ai: isAI ? { state:'IDLE', idleTimer:0, phase:0,
                         outDir:{dc:0,dr:0}, latDir:{dc:0,dr:0},
                         outLeft:0, latLeft:0 } : null
        };
    }

    function _paintBase(p) {
        for (var dr = -BASE_R; dr <= BASE_R; dr++)
            for (var dc = -BASE_R; dc <= BASE_R; dc++) {
                var gc = p.gc+dc, gr = p.gr+dr;
                if (gc>=0&&gc<_COLS&&gr>=0&&gr<_ROWS)
                    _terr[gc+gr*_COLS] = p.index+1;
            }
    }

    function _owner(gc, gr) {
        if (gc<0||gc>=_COLS||gr<0||gr>=_ROWS) return -1;
        return _terr[gc+gr*_COLS]-1;
    }

    function _score(p) {
        var n=0;
        for (var i=0;i<_terr.length;i++) if(_terr[i]===p.index+1) n++;
        return n;
    }

    function _capture(p) {
        if (p.trail.length < 3) return;

        var barrier = new Uint8Array(_COLS*_ROWS);
        for (var i=0;i<p.trail.length;i++) {
            var t=p.trail[i];
            barrier[t.gc+t.gr*_COLS]=1;
        }
        for (var bi=0;bi<_terr.length;bi++)
            if (_terr[bi]===p.index+1) barrier[bi]=1;

        var vis = new Uint8Array(_COLS*_ROWS);
        var q = [], qi = 0;
        function enq(gc,gr) {
            if(gc<0||gc>=_COLS||gr<0||gr>=_ROWS) return;
            var k=gc+gr*_COLS;
            if(vis[k]||barrier[k]) return;
            vis[k]=1; q.push(gc,gr);
        }
        for (var c=0;c<_COLS;c++){enq(c,0);enq(c,_ROWS-1);}
        for (var r=0;r<_ROWS;r++){enq(0,r);enq(_COLS-1,r);}
        while (qi<q.length) {
            var gc2=q[qi++],gr2=q[qi++];
            enq(gc2-1,gr2);enq(gc2+1,gr2);
            enq(gc2,gr2-1);enq(gc2,gr2+1);
        }

        // Claim enclosed cells; wipe enemy trails inside
        for (var bi2=0;bi2<_terr.length;bi2++) {
            if (!vis[bi2]&&!barrier[bi2]) {
                var prev=_terr[bi2]-1;
                if (prev>=0&&prev!==p.index&&_players[prev]) {
                    var ep=_players[prev];
                    var col=bi2%_COLS, row=Math.floor(bi2/_COLS);
                    var key=col+','+row;
                    if (ep.trailSet[key]) {
                        ep.trail=ep.trail.filter(function(t){return t.gc!==col||t.gr!==row;});
                        delete ep.trailSet[key];
                    }
                }
                _terr[bi2]=p.index+1;
            }
        }
        for (var ti=0;ti<p.trail.length;ti++) {
            var tc=p.trail[ti];
            _terr[tc.gc+tc.gr*_COLS]=p.index+1;
        }
    }

    function _killPlayer(p, reason) {
        if (!p.alive) return;
        p.alive   = false;
        p.trail   = [];
        p.trailSet= {};
        p.outside = false;
        for (var i=0;i<_terr.length;i++)
            if (_terr[i]===p.index+1) _terr[i]=0;
        _winReason = reason || '';
    }

    var _resizeObserver = null;  // ResizeObserver for responsive canvas sizing

    function init(canvasEl, isShared, presenceSendFn) {
        _canvas=canvasEl; _ctx=canvasEl.getContext('2d');
        _isShared=!!isShared; _presenceSend=presenceSendFn||null;
        _resize(); _resetState(); _bindInput();
        _running=true; _gameOver=false; _waitStart=true;
        _lastT=performance.now();
        _rafId=requestAnimationFrame(_loop);


        var par = _canvas.parentElement;
        if (par && typeof ResizeObserver !== 'undefined') {
            _resizeObserver = new ResizeObserver(function () {
                var newW = par.clientWidth;
                var newH = par.clientHeight;
                if (newW !== _W || newH !== _H) {
                    var oldCols = _COLS;
                    var oldRows = _ROWS;
                    var oldTerr = _terr;
                    _resize();  

                    _players.forEach(function (p) {
                        p.gc = Math.min(p.gc, _COLS - 1);
                        p.gr = Math.min(p.gr, _ROWS - 1);
                    });

                    _terr = new Uint8Array(_COLS * _ROWS);
                    if (oldTerr) {
                        var copyRows = Math.min(oldRows, _ROWS);
                        var copyCols = Math.min(oldCols, _COLS);
                        for (var gr = 0; gr < copyRows; gr++) {
                            for (var gc = 0; gc < copyCols; gc++) {
                                _terr[gc + gr * _COLS] = oldTerr[gc + gr * oldCols];
                            }
                        }
                    }
                }
            });
            _resizeObserver.observe(par);
        }
    }

    function destroy() {
        _running=false;
        if(_rafId){cancelAnimationFrame(_rafId);_rafId=null;}
        _unbindInput();
        if(_ctx) _ctx.clearRect(0,0,_W,_H);
        _players=[];
        _localColor=null;
        if (_resizeObserver) { _resizeObserver.disconnect(); _resizeObserver = null; }
    }

    function _resize() {
        var par=_canvas.parentElement;
        _W=_canvas.width =par?par.clientWidth :window.innerWidth;
        _H=_canvas.height=par?par.clientHeight:window.innerHeight;

        _COLS = Math.max(2, Math.floor(_W / DOT_SPACING));
        _ROWS = Math.max(2, Math.floor(_H / DOT_SPACING));

        _offX = (_W - (_COLS - 1) * DOT_SPACING) / 2;
        _offY = (_H - (_ROWS - 1) * DOT_SPACING) / 2;

        _CELL = DOT_SPACING; // rendering alias
    }

    function _dotXY(gc, gr) {
        return { x: _offX + gc * DOT_SPACING, y: _offY + gr * DOT_SPACING };
    }

    function _resetState() {
        _terr=new Uint8Array(_COLS*_ROWS);
        _players=[];
        _buildSpawns();
        var p0=_makePlayer(0,false); _paintBase(p0); _players.push(p0);
        if (!_isShared) {
            var p1=_makePlayer(1,true); _paintBase(p1); _players.push(p1);
        }

        if (_localColor) _applyColor(_players[_localIdx], _localColor);
        _nextDc=0;_nextDr=0;_dirPending=false;
        _timeLeftMs=GAME_DURATION_MS;
        _winReason='';
    }

    function _applyColor(p, hex) {
        var r=parseInt(hex.slice(1,3),16),
            g=parseInt(hex.slice(3,5),16),
            b=parseInt(hex.slice(5,7),16);
        p.head = hex;
        p.fill = 'rgb('+Math.round(r*0.78+255*0.22)+','+
                         Math.round(g*0.78+255*0.22)+','+
                         Math.round(b*0.78+255*0.22)+')';
    }

    function _bindInput() {
        _onKey=function(e){
            var dc=0,dr=0,ok=true;
            switch(e.key){
                case 'ArrowUp':   case 'w':case 'W': dr=-1; break;
                case 'ArrowDown': case 's':case 'S': dr= 1; break;
                case 'ArrowLeft': case 'a':case 'A': dc=-1; break;
                case 'ArrowRight':case 'd':case 'D': dc= 1; break;
                default: ok=false;
            }
            if(!ok) return;
            if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].indexOf(e.key)!==-1)
                e.preventDefault();
            if(_waitStart){_waitStart=false;_gameStartT=performance.now();}
            _nextDc=dc;_nextDr=dr;_dirPending=true;
        };
        _onPtr=function(e){
            if(e.target!==_canvas)return;
            var r=_canvas.getBoundingClientRect();
            var startGame = (e.type === 'pointerdown');
            _steerTo(e.clientX-r.left, e.clientY-r.top, startGame);
        };
        _onTouch=function(e){
            var t=e.touches[0],r=_canvas.getBoundingClientRect();
            var startGame = (e.type === 'touchstart');
            _steerTo(t.clientX-r.left, t.clientY-r.top, startGame);
        };
        window.addEventListener('keydown',_onKey);
        _canvas.addEventListener('pointerdown',_onPtr);
        _canvas.addEventListener('pointermove',_onPtr);
        _canvas.addEventListener('touchstart',_onTouch,{passive:true});
        _canvas.addEventListener('touchmove',_onTouch,{passive:true});
    }

    function _unbindInput(){
        if(_onKey)window.removeEventListener('keydown',_onKey);
        if(_canvas&&_onPtr){
            _canvas.removeEventListener('pointerdown',_onPtr);
            _canvas.removeEventListener('pointermove',_onPtr);
        }
        if(_canvas&&_onTouch){
            _canvas.removeEventListener('touchstart',_onTouch);
            _canvas.removeEventListener('touchmove',_onTouch);
        }
        _onKey=_onPtr=_onTouch=null;
    }

    function _steerTo(px, py, startGame) {
        var p=_players[_localIdx]; if(!p)return;
        var ph=_dotXY(p.gc,p.gr);
        var dx=px-ph.x, dy=py-ph.y;
        if(Math.abs(dx)>=Math.abs(dy)){_nextDc=dx>0?1:-1;_nextDr=0;}
        else{_nextDc=0;_nextDr=dy>0?1:-1;}
        _dirPending=true;
        if(startGame && _waitStart){_waitStart=false;_gameStartT=performance.now();}
    }

    function _applyDir(p){
        if(!_dirPending)return;
        _dirPending=false;
        var dc=_nextDc,dr=_nextDr;
        if((p.dc!==0||p.dr!==0)&&dc===-p.dc&&dr===-p.dr)return;
        p.dc=dc;p.dr=dr;
    }

    function _loop(now){
        if(!_running)return;
        _rafId=requestAnimationFrame(_loop);
        if(_waitStart||_gameOver){_render();return;}

        _timeLeftMs=Math.max(0,GAME_DURATION_MS-(now-_gameStartT));
        if(_timeLeftMs===0){
            _gameOver=true;
            _winReason='Time\'s up!';
            _render();return;
        }
        var dt=now-_lastT;
        if(dt>=MS_PER_STEP){
            var steps=Math.min(3,Math.floor(dt/MS_PER_STEP));
            _lastT=now-(dt%MS_PER_STEP);
            for(var s=0;s<steps;s++) _step();
        }
        _render();
    }

    /* ── Game step ──────────────────────────────────────────────────────────── */
    function _step(){
        _players.forEach(function(p){
            if(!p.alive)return;
            if(!p.isAI){_applyDir(p);_movePlayer(p);}
            else{_aiDecide(p);_movePlayer(p);}
        });
        _checkGameOver();
    }

    function _movePlayer(p){
        if(!p.alive||(p.dc===0&&p.dr===0))return;

        var ngc=p.gc+p.dc, ngr=p.gr+p.dr;

        if(ngc<0||ngc>=_COLS||ngr<0||ngr>=_ROWS) return;

        var nkey=ngc+','+ngr;

        if(p.outside&&p.trailSet[nkey]){
            _killPlayer(p, p.isAI?'AI hit its own trail!':'You hit your own trail!');
            return;
        }

        for(var ei=0;ei<_players.length;ei++){
            var ep=_players[ei];
            if(!ep.alive||ep.index===p.index)continue;
            if(ep.trailSet[nkey]){
                _killPlayer(ep, ep.isAI?'You cut the AI\'s trail!':'AI cut your trail!');
            }
        }

        // If player was killed during enemy-check above, stop
        if(!p.alive)return;

        p.gc=ngc; p.gr=ngr;
        var inOwn=_owner(p.gc,p.gr)===p.index;

        if(!p.outside&&!inOwn){
            p.outside=true;
            p.trail=[{gc:p.gc,gr:p.gr}];
            p.trailSet={}; p.trailSet[p.gc+','+p.gr]=true;
        } else if(p.outside&&!inOwn){
            if(!p.trailSet[nkey]){
                p.trail.push({gc:p.gc,gr:p.gr});
                p.trailSet[p.gc+','+p.gr]=true;
            }
        } else if(p.outside&&inOwn){
            _capture(p);
            p.trail=[]; p.trailSet={}; p.outside=false;
        }
    }

    function _checkGameOver(){
        var total=_COLS*_ROWS;
        var alive=_players.filter(function(p){return p.alive;});

        // Any dead player triggers end in 1v1
        if(alive.length<_players.length){
            _gameOver=true; return;
        }

        // 100% territory
        for(var i=0;i<_players.length;i++){
            var p=_players[i];
            if(_score(p)>=total){
                _gameOver=true;
                _winReason=(p.index===_localIdx?'You':'AI')+' captured 100%!';
                return;
            }
        }
    }

    function _aiDecide(p){
        var ai=p.ai;

        var human=_players[_localIdx];
        if(human&&human.alive&&human.outside&&human.trail.length>2){
            var DIRS4=[{dc:1,dr:0},{dc:-1,dr:0},{dc:0,dr:1},{dc:0,dr:-1}];
            for(var hi=0;hi<DIRS4.length;hi++){
                var hd=DIRS4[hi];
                if((p.dc!==0||p.dr!==0)&&hd.dc===-p.dc&&hd.dr===-p.dr)continue;
                var hnc=p.gc+hd.dc, hnr=p.gr+hd.dr;
                if(hnc<0||hnc>=_COLS||hnr<0||hnr>=_ROWS)continue;
                if(human.trailSet[hnc+','+hnr]){
                    p.dc=hd.dc; p.dr=hd.dr;
                    return;
                }
            }
        }

        if(ai.state==='IDLE'){
            ai.idleTimer--;
            if(ai.idleTimer>0)return;

            // Pick direction that leads toward the most unclaimed territory
            var DIRS=[{dc:1,dr:0},{dc:-1,dr:0},{dc:0,dr:1},{dc:0,dr:-1}];
            _shuffle(DIRS);
            var chosen=null;
            var bestUnclaimed=-1;
            for(var i=0;i<DIRS.length;i++){
                var d=DIRS[i];
                // Don't reverse into current direction
                if((p.dc!==0||p.dr!==0)&&d.dc===-p.dc&&d.dr===-p.dr)continue;
                var unclaimed=0;
                for(var step=1;step<=8;step++){
                    var probe=p.gc+d.dc*step, probr=p.gr+d.dr*step;
                    if(probe<0||probe>=_COLS||probr<0||probr>=_ROWS)break;
                    if(_owner(probe,probr)!==p.index) unclaimed++;
                }
                if(unclaimed>bestUnclaimed){bestUnclaimed=unclaimed;chosen=d;}
            }
            if(!chosen)chosen=DIRS[0];

            var latOpts=[{dc:-chosen.dr,dr:chosen.dc},{dc:chosen.dr,dr:-chosen.dc}];
            var lat=latOpts[Math.random()<0.5?0:1];
            ai.outDir =chosen; ai.latDir=lat;
            ai.outLeft=8+Math.floor(Math.random()*10);
            ai.latLeft=5+Math.floor(Math.random()*8);
            ai.phase=0; ai.state='EXPAND';
            return;
        }

        if(ai.state==='EXPAND'){
            var trailLen=p.trail.length;
            var maxTrail=Math.floor(Math.min(_COLS,_ROWS)*0.38);
            if(trailLen>=maxTrail){ai.state='RETURN';return;}

            var dir;
            if(ai.phase===0){
                dir=ai.outDir; ai.outLeft--;
                if(ai.outLeft<=0)ai.phase=1;
            } else {
                dir=ai.latDir; ai.latLeft--;
                if(ai.latLeft<=0){ai.state='RETURN';return;}
            }

            var nc=p.gc+dir.dc, nr=p.gr+dir.dr;
            if(nc<0||nc>=_COLS||nr<0||nr>=_ROWS||p.trailSet[nc+','+nr]){
                ai.state='RETURN'; return;
            }

            if(!p.outside && _owner(nc,nr)===p.index && ai.phase===0){
                var lat2=ai.latDir;
                var lnc=p.gc+lat2.dc, lnr=p.gr+lat2.dr;
                if(lnc>=0&&lnc<_COLS&&lnr>=0&&lnr<_ROWS&&_owner(lnc,lnr)!==p.index){
                    p.dc=lat2.dc; p.dr=lat2.dr;
                    ai.latLeft--;
                    if(ai.latLeft<=0){ai.state='RETURN';}
                    return;
                }
            }
            p.dc=dir.dc; p.dr=dir.dr;
            return;
        }

        if(ai.state==='RETURN'){
            if(!p.outside){
                ai.state='IDLE'; ai.idleTimer=0;
                p.dc=0; p.dr=0; return;
            }
            var RDIRS=[{dc:1,dr:0},{dc:-1,dr:0},{dc:0,dr:1},{dc:0,dr:-1}];
            var bestD=Infinity, bestDir2=null;
            for(var ri=0;ri<RDIRS.length;ri++){
                var rd=RDIRS[ri];
                if((p.dc!==0||p.dr!==0)&&rd.dc===-p.dc&&rd.dr===-p.dr)continue;
                var rnc=p.gc+rd.dc, rnr=p.gr+rd.dr;
                if(rnc<0||rnc>=_COLS||rnr<0||rnr>=_ROWS)continue;
                if(p.trailSet[rnc+','+rnr])continue;
                var dist=_nearestOwn(rnc,rnr,p.index);
                if(dist<bestD){bestD=dist;bestDir2=rd;}
            }
            if(bestDir2){p.dc=bestDir2.dc;p.dr=bestDir2.dr;}
            else{p.dc=-p.dc;p.dr=-p.dr;}
        }
    }

    function _nearestOwn(gc,gr,pidx){
        for(var rad=0;rad<=28;rad++){
            for(var dr=-rad;dr<=rad;dr++){
                for(var dc=-rad;dc<=rad;dc++){
                    if(Math.abs(dc)!==rad&&Math.abs(dr)!==rad)continue;
                    var c=gc+dc,r=gr+dr;
                    if(c<0||c>=_COLS||r<0||r>=_ROWS)continue;
                    if(_owner(c,r)===pidx)return Math.abs(dc)+Math.abs(dr);
                }
            }
        }
        return 9999;
    }

    function _shuffle(arr){
        for(var i=arr.length-1;i>0;i--){
            var j=Math.floor(Math.random()*(i+1));
            var t=arr[i];arr[i]=arr[j];arr[j]=t;
        }
    }

    function _render(){
        if(!_ctx)return;
        var W=_W,H=_H;

        // 1. Background — light Sugarizer style
        _ctx.fillStyle='#f7f8fc';
        _ctx.fillRect(0,0,W,H);

        // 2. Territory cells — tiles aligned to the dot grid.
        var fills=_players.map(function(p){return p.fill;});
        for(var gr=0;gr<_ROWS;gr++){
            for(var gc=0;gc<_COLS;gc++){
                var own=_terr[gc+gr*_COLS]-1;
                if(own<0||own>=fills.length)continue;
                _ctx.fillStyle=fills[own];
                // Each tile centred on its dot, spanning to adjacent dots
                var tx = _offX + gc * DOT_SPACING - DOT_SPACING * 0.5;
                var ty = _offY + gr * DOT_SPACING - DOT_SPACING * 0.5;
                _ctx.fillRect(tx, ty, DOT_SPACING + 1, DOT_SPACING + 1);
            }
        }

        // 3. Dot grid — use _dotXY for consistency with all other rendering.
        _ctx.fillStyle = 'rgba(0,0,0,0.30)';
        for(var drow=0;drow<_ROWS;drow++){
            for(var dcol=0;dcol<_COLS;dcol++){
                var dp = _dotXY(dcol, drow);
                _ctx.beginPath();
                _ctx.arc(dp.x, dp.y, 4, 0, Math.PI*2);
                _ctx.fill();
            }
        }

        // 4. Trails — draw from territory-edge to player head with no gap.
       
        _players.forEach(function(p){
            if(!p.alive||p.trail.length<1)return;
            _ctx.strokeStyle=p.head;
            _ctx.lineWidth=8;
            _ctx.lineCap='round';
            _ctx.lineJoin='round';
            _ctx.beginPath();

            var t0=_dotXY(p.trail[0].gc,p.trail[0].gr);

            if(p.trail.length>=2){
                // Direction from trail[0] to trail[1]: that's the outbound direction.
                // We go the opposite way (back toward territory) by half a cell.
                var t1=p.trail[1];
                var outDc=t1.gc-p.trail[0].gc, outDr=t1.gr-p.trail[0].gr;
                // Normalise (only cardinal directions, so max 1 step)
                var len=Math.sqrt(outDc*outDc+outDr*outDr)||1;
                outDc/=len; outDr/=len;
                _ctx.moveTo(t0.x - outDc*DOT_SPACING*0.5,
                            t0.y - outDr*DOT_SPACING*0.5);
            } else {
                // Only one dot in trail — extend back from player's current direction
                var backDc = -(p.dc||0), backDr = -(p.dr||0);
                _ctx.moveTo(t0.x + backDc*DOT_SPACING*0.5,
                            t0.y + backDr*DOT_SPACING*0.5);
            }

            _ctx.lineTo(t0.x, t0.y);
            for(var i=1;i<p.trail.length;i++){
                var ti=_dotXY(p.trail[i].gc,p.trail[i].gr);
                _ctx.lineTo(ti.x,ti.y);
            }
           
            var ph=_dotXY(p.gc,p.gr);
            _ctx.lineTo(ph.x,ph.y);
            _ctx.stroke();
        });

        // 5. Player heads
        _players.forEach(function(p){
            if(!p.alive)return;
            var dh=_dotXY(p.gc,p.gr);
            var cx=dh.x, cy=dh.y, r=14;

            if(p.index===_localIdx){
                _ctx.strokeStyle='rgba(0,0,0,0.30)';
                _ctx.lineWidth=3;
                _ctx.beginPath();_ctx.arc(cx,cy,r+3,0,Math.PI*2);_ctx.stroke();
            }
            _ctx.fillStyle=p.head;
            _ctx.beginPath();_ctx.arc(cx,cy,r,0,Math.PI*2);_ctx.fill();
            _ctx.strokeStyle='rgba(255,255,255,0.9)';_ctx.lineWidth=2;_ctx.stroke();

            if(p.dc!==0||p.dr!==0){
                var a=p.dc===1?'▶':p.dc===-1?'◀':p.dr===1?'▼':'▲';
                _ctx.fillStyle='#fff';
                _ctx.font='bold 11px sans-serif';
                _ctx.textAlign='center';_ctx.textBaseline='middle';
                _ctx.fillText(a,cx,cy);
            }
        });

        // 6. Scoreboard
        _drawScoreboard();

        // 7. Start prompt
        if(_waitStart)_drawStartPrompt();

        // 8. Game over
        if(_gameOver)_drawGameOver();

        // 9. Bottom hint
        _ctx.save();
        _ctx.fillStyle='rgba(0,0,0,0.28)';
        _ctx.font='11px "Helvetica Neue",Helvetica,Arial,sans-serif';
        _ctx.textAlign='center';_ctx.textBaseline='bottom';
        _ctx.fillText('Arrow keys / WASD  ·  Click or tap to steer',W/2,H-5);
        _ctx.restore();
    }

    function _drawScoreboard(){
        var total=_COLS*_ROWS; if(!total)return;
        var pad=10,lh=22,W=_W;
        _ctx.save();
        var bw=156, bh=pad*2+14+lh*_players.length+26;
        var bx=W-bw-8, by=8;

        // Light card — sharp rectangle, Sugarizer style
        _ctx.fillStyle='rgba(255,255,255,0.95)';
        _ctx.strokeStyle='#dde1ea';_ctx.lineWidth=1.5;
        _ctx.beginPath();_ctx.rect(bx,by,bw,bh);
        _ctx.fill();_ctx.stroke();

        var secsLeft=Math.ceil(_timeLeftMs/1000);
        var tColor=secsLeft<=10?'#c0392b':'#333333';

        _ctx.fillStyle='rgba(0,0,0,0.45)';
        _ctx.font='bold 10px "Helvetica Neue",Helvetica,Arial,sans-serif';
        _ctx.textAlign='left';_ctx.textBaseline='top';
        _ctx.fillText('TERRITORY',bx+pad,by+pad);

        _ctx.fillStyle=tColor;
        _ctx.font='bold 13px "Helvetica Neue",Helvetica,Arial,sans-serif';
        _ctx.textAlign='right';
        _ctx.fillText(_waitStart?'1:30':_fmtTime(secsLeft),bx+bw-pad,by+pad-1);

        _players.forEach(function(p,i){
            var pct=Math.round(_score(p)/total*100);
            var y=by+pad+14+lh*i;
            _ctx.globalAlpha=p.alive?1:0.35;

            _ctx.fillStyle=p.head;
            _ctx.beginPath();_ctx.rect(bx+pad,y+4,12,12);_ctx.fill();

            var barX=bx+pad+18, barW=bw-pad*2-18-42;
            _ctx.fillStyle=p.fill;
            _ctx.beginPath();_ctx.rect(barX,y+6,Math.max(3,barW*pct/100),8);_ctx.fill();

            var lbl=p.isAI?'AI':(p.index===_localIdx?'You':'P'+(p.index+1));
            if(!p.alive) lbl+=' ✕';
            _ctx.fillStyle='#333333';
            _ctx.font='bold 10px "Helvetica Neue",Helvetica,Arial,sans-serif';
            _ctx.textAlign='right';_ctx.textBaseline='top';
            _ctx.fillText(lbl+' '+pct+'%',bx+bw-pad,y+4);
            _ctx.globalAlpha=1;
        });

        // Timer drain bar
        var ty=by+pad+14+lh*_players.length+4;
        var maxBW=bw-pad*2;
        var frac=_waitStart?1:Math.max(0,_timeLeftMs/GAME_DURATION_MS);
        _ctx.fillStyle=secsLeft<=10?'#c0392b':'rgba(0,0,0,0.45)';
        _ctx.beginPath();_ctx.rect(bx+pad,ty,Math.max(3,maxBW*frac),5);_ctx.fill();

        _ctx.restore();
    }

    function _fmtTime(s){var m=Math.floor(s/60),sec=s%60;return m+':'+(sec<10?'0':'')+sec;}

    function _drawStartPrompt(){
        var W=_W,H=_H;
        _ctx.save();
        var msg='Press  ↑ ↓ ← →  or  W A S D  to start';
        _ctx.font='bold 15px "Helvetica Neue",Helvetica,Arial,sans-serif';
        var tw=_ctx.measureText(msg).width;
        var pw=tw+36,ph=40,px=(W-pw)/2,py=H/2-ph/2;

        _ctx.fillStyle='rgba(255,255,255,0.97)';
        _ctx.strokeStyle='#dde1ea';_ctx.lineWidth=1.5;
        _ctx.beginPath();_ctx.rect(px,py,pw,ph);
        _ctx.fill();_ctx.stroke();

        var pulse=Math.floor(Date.now()/600)%2===0;
        _ctx.fillStyle=pulse?'#222222':'rgba(0,0,0,0.45)';
        _ctx.textAlign='center';_ctx.textBaseline='middle';
        _ctx.fillText(msg,W/2,py+ph/2);
        _ctx.restore();
    }

    function _drawGameOver(){
        var W=_W,H=_H;
        var alivePlayers=_players.filter(function(p){return p.alive;});
        var winner;
        if(alivePlayers.length===1){
            winner=alivePlayers[0];
        } else {
            winner=_players.reduce(function(b,p){return _score(p)>_score(b)?p:b;},_players[0]);
        }

        _ctx.fillStyle='rgba(247,248,252,0.75)';
        _ctx.fillRect(0,0,W,H);

        var cw=Math.min(W*0.6,440),ch=200,cx=(W-cw)/2,cy=(H-ch)/2;

        _ctx.fillStyle='#ffffff';
        _ctx.strokeStyle='#dde1ea';_ctx.lineWidth=1.5;
        _ctx.beginPath();_ctx.rect(cx,cy,cw,ch);
        _ctx.fill();_ctx.stroke();

        _ctx.fillStyle=winner.head;
        _ctx.fillRect(cx,cy,cw,5);

        var lbl=winner.index===_localIdx?'You Win!':winner.isAI?'AI Wins!':'Player '+(winner.index+1)+' Wins!';
        _ctx.fillStyle=winner.head;
        _ctx.font='bold 34px "Helvetica Neue",Helvetica,Arial,sans-serif';
        _ctx.textAlign='center';_ctx.textBaseline='middle';
        _ctx.fillText(lbl,W/2,cy+58);

        if(_winReason){
            _ctx.fillStyle='rgba(0,0,0,0.50)';
            _ctx.font='13px "Helvetica Neue",Helvetica,Arial,sans-serif';
            _ctx.fillText(_winReason,W/2,cy+96);
        }

        var pct=Math.round(_score(winner)/(_COLS*_ROWS)*100);
        _ctx.fillStyle='#333333';
        _ctx.font='14px "Helvetica Neue",Helvetica,Arial,sans-serif';
        _ctx.fillText(pct+'% of the board captured',W/2,cy+124);

        _ctx.fillStyle='rgba(0,0,0,0.32)';
        _ctx.font='12px "Helvetica Neue",Helvetica,Arial,sans-serif';
        _ctx.fillText('Press the Replay button to play again',W/2,cy+166);
    }

    function setColor(hex){
        _localColor = hex;                          // remember for post-reset re-apply
        var p = _players[_localIdx]; if(!p) return;
        _applyColor(p, hex);
    }

    function clearBoard(broadcast){
        _gameOver=false;_waitStart=true;
        _gameStartT=0;_timeLeftMs=GAME_DURATION_MS;_winReason='';
        _resize();_resetState();
        if(broadcast&&_isShared&&_presenceSend)_presenceSend({action:'game-clear'});
        if(!_rafId&&_running){_lastT=performance.now();_rafId=requestAnimationFrame(_loop);}
    }

    function getState(){
        return {
            mode:'game', terrBuf:Array.from(_terr), gameOver:_gameOver,
            players:_players.map(function(p){
                return {index:p.index,isAI:p.isAI,alive:p.alive,
                        gc:p.gc,gr:p.gr,dc:p.dc,dr:p.dr,
                        trail:p.trail.slice(),outside:p.outside};
            })
        };
    }

    function loadState(st){
        if(!st||st.mode!=='game')return;
        _gameOver=!!st.gameOver;
        if(st.terrBuf)_terr=new Uint8Array(st.terrBuf);
        if(st.players){
            _players=st.players.map(function(pd){
                var p=_makePlayer(pd.index,pd.isAI);
                _paintBase(p);
                p.gc=pd.gc;p.gr=pd.gr;p.dc=pd.dc;p.dr=pd.dr;
                p.alive=pd.alive;p.trail=pd.trail||[];
                p.outside=pd.outside||false;p.trailSet={};
                p.trail.forEach(function(t){p.trailSet[t.gc+','+t.gr]=true;});
                return p;
            });
        }
        _waitStart=false;
    }

    function applyRemoteMove(msg){
        if(!msg)return;
        if(msg.action==='game-clear'){clearBoard(false);return;}
        if(msg.action==='game-join'){
            if(!_players.some(function(p){return p.index===msg.playerIndex;})&&msg.playerIndex!==_localIdx)
                _players.push(_makePlayer(msg.playerIndex,false));
            return;
        }
        if(msg.action==='game-move'){
            var rp=_players.find(function(p){return p.index===msg.playerIndex;});
            if(!rp)return;
            rp.gc=msg.gc;rp.gr=msg.gr;rp.dc=msg.dc;rp.dr=msg.dr;
            rp.trail=msg.trail||[];rp.trailSet={};
            rp.trail.forEach(function(t){rp.trailSet[t.gc+','+t.gr]=true;});
            if(msg.terr)_terr=new Uint8Array(msg.terr);
        }
    }

    return {init,destroy,setColor,clearBoard,getState,loadState,applyRemoteMove};
});