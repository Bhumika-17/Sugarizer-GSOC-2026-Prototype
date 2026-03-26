define([], function () {
    'use strict';

    var DOT_SPACING = 40, DOT_RADIUS = 7, HIT_RADIUS = 30;

    var TEMPLATES = {
        pentagon: [
            { fr:  3/32, fc: 16/32 },
            { fr: 12/32, fc: 29/32 },
            { fr: 27/32, fc: 24/32 },
            { fr: 27/32, fc:  8/32 },
            { fr: 12/32, fc:  3/32 }
        ],
        hexagon: [
            { fr: 16/32, fc: 29/32 },
            { fr: 28/32, fc: 23/32 },
            { fr: 28/32, fc:  9/32 },
            { fr: 16/32, fc:  3/32 },
            { fr:  4/32, fc:  9/32 },
            { fr:  4/32, fc: 23/32 }
        ],
        arrow: [
            { fr:  2/32, fc: 16/32 },
            { fr: 12/32, fc: 26/32 },
            { fr: 12/32, fc: 20/32 },
            { fr: 28/32, fc: 20/32 },
            { fr: 28/32, fc: 12/32 },
            { fr: 12/32, fc: 12/32 },
            { fr: 12/32, fc:  6/32 }
        ],
        star: [
            { fr:  2/32, fc: 16/32 },
            { fr: 11/32, fc: 19/32 },
            { fr: 12/32, fc: 29/32 },
            { fr: 18/32, fc: 21/32 },
            { fr: 27/32, fc: 24/32 },
            { fr: 22/32, fc: 16/32 },
            { fr: 27/32, fc:  8/32 },
            { fr: 18/32, fc: 11/32 },
            { fr: 12/32, fc:  3/32 },
            { fr: 11/32, fc: 13/32 }
        ],
        starburst: [
            { fr:  2/32, fc: 16/32 },
            { fr: 11/32, fc: 18/32 },
            { fr:  6/32, fc: 26/32 },
            { fr: 14/32, fc: 21/32 },
            { fr: 16/32, fc: 30/32 },
            { fr: 18/32, fc: 21/32 },
            { fr: 26/32, fc: 26/32 },
            { fr: 21/32, fc: 18/32 },
            { fr: 30/32, fc: 16/32 },
            { fr: 21/32, fc: 14/32 },
            { fr: 26/32, fc:  6/32 },
            { fr: 18/32, fc: 11/32 },
            { fr: 16/32, fc:  2/32 },
            { fr: 14/32, fc: 11/32 },
            { fr:  6/32, fc:  6/32 },
            { fr: 11/32, fc: 14/32 }
        ]
    };

    var _defaultShape = 'pentagon';
    var _canvas=null,_ctx=null,_template=[],_templateFrac=TEMPLATES[_defaultShape],_currentShape=_defaultShape;
    var _lines=[],_activeColor='#b5c8f0',_nextIdx=0,_selected=false,_reject=false,_complete=false,_hoverPos=null;
    var _COLS=0,_ROWS=0,_offX=0,_offY=0;

    function _onDown(e){
        if(!_canvas||_complete)return;
        var pos=_canvasPos(e),hit=_nearestDot(pos.x,pos.y);
        if(hit===null)return;
        if(!_selected){if(hit!==0){_flash();return;}_selected=true;_nextIdx=0;_render();return;}
        if(_nextIdx===_template.length-1){
            if(hit!==0){_flash();return;}
            var last=_template[_nextIdx],first=_template[0];
            _lines.push({r1:last.r,c1:last.c,r2:first.r,c2:first.c,color:_activeColor});
            _complete=true;_hoverPos=null;_render();return;
        }
        var expected=_nextIdx+1;
        if(hit!==expected){_flash();return;}
        var from=_template[_nextIdx],to=_template[expected];
        _lines.push({r1:from.r,c1:from.c,r2:to.r,c2:to.c,color:_activeColor});
        _nextIdx=expected;_hoverPos=null;_render();
    }
    function _onMove(e){if(!_canvas||!_selected||_complete)return;_hoverPos=_canvasPos(e);_render();}
    function _onLeave(){_hoverPos=null;if(_ctx)_render();}
    function _snapTemplate(){
        _template=_templateFrac.map(function(pt){
            return{r:Math.min(_ROWS-1,Math.round(pt.fr*(_ROWS-1))),
                   c:Math.min(_COLS-1,Math.round(pt.fc*(_COLS-1)))};
        });
    }
    function _onResize(){
        if(!_canvas)return;
        var p=_canvas.parentElement;
        _canvas.width=p.clientWidth;_canvas.height=p.clientHeight;
        _COLS=Math.max(2,Math.floor(_canvas.width/DOT_SPACING));
        _ROWS=Math.max(2,Math.floor(_canvas.height/DOT_SPACING));
        _offX=(_canvas.width-(_COLS-1)*DOT_SPACING)/2;
        _offY=(_canvas.height-(_ROWS-1)*DOT_SPACING)/2;
        _snapTemplate();_render();
    }
    function _canvasPos(e){var r=_canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};}
    function _canvasPosFromTouch(t){var r=_canvas.getBoundingClientRect();return{x:t.clientX-r.left,y:t.clientY-r.top};}
    function _onTouchStart(e){if(!_canvas||!e.touches.length)return;e.preventDefault();_onDown({clientX:e.touches[0].clientX,clientY:e.touches[0].clientY});}
    function _onTouchMove(e){if(!_canvas||!e.touches.length)return;e.preventDefault();_onMove({clientX:e.touches[0].clientX,clientY:e.touches[0].clientY});}
    function _onTouchEnd(e){e.preventDefault();_onLeave();}
    function _xy(r,c){return{x:_offX+c*DOT_SPACING,y:_offY+r*DOT_SPACING};}
    function _nearestDot(px,py){
        var best=null,bd=HIT_RADIUS;
        for(var i=0;i<_template.length;i++){
            var d=_template[i],p=_xy(d.r,d.c),dist=Math.hypot(px-p.x,py-p.y);
            if(dist<bd){bd=dist;best=i;}
        }
        return best;
    }
    function _flash(){_reject=true;_render();setTimeout(function(){_reject=false;_render();},350);}
    function _fillShape(ctx){
        if(_lines.length<_template.length)return;
        ctx.save();ctx.beginPath();
        var p0=_xy(_template[0].r,_template[0].c);ctx.moveTo(p0.x,p0.y);
        for(var i=1;i<_template.length;i++){var p=_xy(_template[i].r,_template[i].c);ctx.lineTo(p.x,p.y);}
        ctx.closePath();ctx.fillStyle=_activeColor;ctx.globalAlpha=0.55;ctx.fill('nonzero');ctx.restore();
    }
    function _render(){
        if(!_ctx)return;
        _ctx.clearRect(0,0,_canvas.width,_canvas.height);
        for(var gr=0;gr<_ROWS;gr++)for(var gc=0;gc<_COLS;gc++){
            var gp=_xy(gr,gc);_ctx.beginPath();_ctx.arc(gp.x,gp.y,4,0,Math.PI*2);
            _ctx.fillStyle='#7a8aaa';_ctx.fill();
        }
        if(_complete)_fillShape(_ctx);
        _lines.forEach(function(l){
            var a=_xy(l.r1,l.c1),b=_xy(l.r2,l.c2);
            _ctx.beginPath();_ctx.moveTo(a.x,a.y);_ctx.lineTo(b.x,b.y);
            _ctx.strokeStyle=l.color||_activeColor;_ctx.lineWidth=4;_ctx.lineCap='round';_ctx.stroke();
        });
        if(_selected&&!_complete&&_hoverPos){
            var fa=_xy(_template[_nextIdx].r,_template[_nextIdx].c);
            _ctx.save();_ctx.beginPath();_ctx.moveTo(fa.x,fa.y);_ctx.lineTo(_hoverPos.x,_hoverPos.y);
            _ctx.strokeStyle=_activeColor;_ctx.lineWidth=3;_ctx.globalAlpha=0.50;
            _ctx.lineCap='round';_ctx.setLineDash([7,5]);_ctx.stroke();_ctx.restore();
        }
        var fs=Math.max(16,Math.round(DOT_RADIUS*2.8));
        for(var i=0;i<_template.length;i++){
            var d=_template[i],pos=_xy(d.r,d.c);
            var visited=_complete||(_selected&&i<=_nextIdx);
            var isNow=_selected&&!_complete&&i===_nextIdx;
            var closingStep=_selected&&!_complete&&_nextIdx===_template.length-1&&i===0;
            var isNext=(_selected&&!_complete&&i===_nextIdx+1)||closingStep;
            var fill;
            if(_reject&&!visited&&!closingStep)fill='#f87171';
            else if(visited)fill=_activeColor;
            else if(isNow)fill='#ffcc00';
            else if(isNext)fill='#ffe580';
            else fill='#c8cedc';
            _ctx.beginPath();_ctx.arc(pos.x,pos.y,DOT_RADIUS,0,Math.PI*2);_ctx.fillStyle=fill;_ctx.fill();
            if(isNext){_ctx.strokeStyle='#e67e00';_ctx.lineWidth=2.5;_ctx.stroke();}
            if(isNow){_ctx.strokeStyle='#c9900a';_ctx.lineWidth=2.5;_ctx.stroke();}
            _ctx.font='bold '+fs+'px sans-serif';_ctx.textAlign='center';_ctx.textBaseline='bottom';
            var numX=pos.x,numY=pos.y-DOT_RADIUS-2;
            _ctx.lineWidth=4;_ctx.strokeStyle='white';_ctx.strokeText(i+1,numX,numY);
            _ctx.fillStyle=visited?'#1a3a6b':'#444';_ctx.fillText(i+1,numX,numY);
        }
        if(_complete){
            var bd2=_template.reduce(function(b,d){return d.r>b.r?d:b;},_template[0]);
            var bp=_xy(bd2.r,bd2.c),msgY=Math.min(bp.y+DOT_RADIUS+28,_canvas.height-10);
            var mfs=Math.max(11,Math.round(_canvas.width/48));
            _ctx.save();_ctx.font='bold '+mfs+'px "Helvetica Neue",Helvetica,Arial,sans-serif';
            _ctx.textAlign='center';_ctx.textBaseline='top';_ctx.fillStyle=_activeColor;
            _ctx.fillText('Finished!',_canvas.width/2,msgY);_ctx.restore();
        }
        if(!_selected&&!_complete){
            var hfs=Math.max(13,Math.round(_canvas.width/45));
            _ctx.save();_ctx.font=hfs+'px sans-serif';_ctx.fillStyle='rgba(80,80,120,0.70)';
            _ctx.textAlign='center';_ctx.textBaseline='top';
            _ctx.fillText('Tap dot 1 to start',_canvas.width/2,8);_ctx.restore();
        }
    }

    var numgrid={};
    numgrid.init=function(canvasEl){
        _canvas=canvasEl;_ctx=_canvas.getContext('2d');
        _lines=[];_nextIdx=0;_selected=false;_reject=false;_complete=false;_hoverPos=null;
        _templateFrac=TEMPLATES[_currentShape]||TEMPLATES[_defaultShape];
        window.addEventListener('resize',_onResize);
        _canvas.addEventListener('pointerdown',_onDown);
        _canvas.addEventListener('pointermove',_onMove);
        _canvas.addEventListener('pointerleave',_onLeave);
        _canvas.addEventListener('pointercancel',_onLeave);
        _canvas.addEventListener('touchstart',_onTouchStart,{passive:false});
        _canvas.addEventListener('touchmove',_onTouchMove,{passive:false});
        _canvas.addEventListener('touchend',_onTouchEnd,{passive:false});
        _canvas.addEventListener('touchcancel',_onTouchEnd,{passive:false});
        _onResize();
    };
    numgrid.setShape=function(shape){
        if(!TEMPLATES[shape])return;
        _currentShape=shape;_templateFrac=TEMPLATES[shape];
        _lines=[];_nextIdx=0;_selected=false;_reject=false;_complete=false;_hoverPos=null;
        if(_canvas){_snapTemplate();_render();}
    };
    numgrid.getCurrentShape=function(){return _currentShape;};
    numgrid.setColor=function(c){_activeColor=c;};
    numgrid.clearBoard=function(){
        _lines=[];_nextIdx=0;_selected=false;_reject=false;_complete=false;_hoverPos=null;_render();
    };
    numgrid.getState=function(){
        return{lines:_lines,activeColor:_activeColor,nextIndex:_nextIdx,
               selected:_selected,complete:_complete,shape:_currentShape,mode:'number'};
    };
    numgrid.loadState=function(state){
        _currentShape=state.shape||_defaultShape;
        _templateFrac=TEMPLATES[_currentShape]||TEMPLATES[_defaultShape];
        _lines=state.lines||[];_activeColor=state.activeColor||'#b5c8f0';
        _nextIdx=state.nextIndex||0;_selected=state.selected||false;
        _complete=state.complete||false;_reject=false;_hoverPos=null;
        if(_canvas){_snapTemplate();_render();}
    };
    numgrid.destroy=function(){
        window.removeEventListener('resize',_onResize);
        if(_canvas){
            _canvas.removeEventListener('pointerdown',_onDown);
            _canvas.removeEventListener('pointermove',_onMove);
            _canvas.removeEventListener('pointerleave',_onLeave);
            _canvas.removeEventListener('pointercancel',_onLeave);
            _canvas.removeEventListener('touchstart',_onTouchStart);
            _canvas.removeEventListener('touchmove',_onTouchMove);
            _canvas.removeEventListener('touchend',_onTouchEnd);
            _canvas.removeEventListener('touchcancel',_onTouchEnd);
            if(_ctx){_ctx.clearRect(0,0,_canvas.width,_canvas.height);}
        }
        _canvas=null;_ctx=null;_hoverPos=null;
    };
    return numgrid;
});
