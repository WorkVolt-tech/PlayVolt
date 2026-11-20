import React,{useLayoutEffect,useRef,useState} from 'react';
import {ChipDisc} from './looks.jsx';
import {arcadeChipFlights,shouldAnimateBoard} from './arcadeMotion.js';

// The board is rendered at its final server-confirmed position at all times.
// Only newly added chips are visually covered during a short decorative fall.
export function useArcadeFallingChips({board,width,height,matchNumber=1,
 floorClears=0,moveCount=0,lastMove=null,mode='classic',
 speedOrder=[],speedPreviousOrder=[]}){
 const previous=useRef(null);
 const timeout=useRef(null);
 const [flights,setFlights]=useState([]);
 useLayoutEffect(()=>{
  const previousBoard=previous.current;
  const current={board:Array.isArray(board)?board.slice():[],width,height,
    matchNumber,floorClears,moveCount};
  previous.current=current;
  if(!shouldAnimateBoard(previousBoard,current)) {
   clearTimeout(timeout.current);
   setFlights([]);
   return undefined;
  }
  if(!Array.isArray(board)||board.every((v,i)=>v===previousBoard.board[i])){
   return undefined;
  }
  clearTimeout(timeout.current);
  const reduced=typeof window!=='undefined'&&
   window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if(reduced){
   setFlights([]);
   return undefined;
  }
  const next=arcadeChipFlights(previousBoard.board,board,width,height,{
   reset:moveCount<previousBoard.moveCount,
   blast:lastMove?.kind==='blast',
   floorCleared:floorClears!==previousBoard.floorClears,
   speedOrder:mode==='speed'?speedOrder:[],
   previousOrder:mode==='speed'?speedPreviousOrder:[],
   lastMove
  });
  setFlights(next);
  if(next.length){
   const until=Math.max(...next.map(f=>f.duration+f.delay))+135;
   timeout.current=window.setTimeout(()=>setFlights([]),until);
  }
  return undefined;
 },[board,width,height,matchNumber,floorClears,moveCount,mode]);
 useLayoutEffect(()=>()=>clearTimeout(timeout.current),[]);
 const hidden=new Set(flights.map(f=>f.index));
 return {flights,hidden};
}

export function ArcadeFallingChips({flights,width,height,players=[],teamMode=false}){
 if(!flights.length)return null;
 return <div className="arcade-fall-layer"
   style={{gridTemplateColumns:'repeat('+width+',minmax(0,1fr))',
     gridTemplateRows:'repeat('+height+',minmax(0,1fr))'}}
   aria-hidden="true">
   {flights.map(f=>{
    const style={
      gridColumn:f.column+1,gridRow:f.row+1,
      '--arcade-flight-start':-(f.row+1)*100+'%',
      '--arcade-flight-delay':f.delay+'ms',
      '--arcade-flight-duration':f.duration+'ms'
    };
    return <div className="arcade-flying-chip" key={f.index+'-'+f.seat} style={style}>
      <ChipDisc seat={f.seat}
        style={players.find(p=>p.seat===f.seat)?.chipStyle||'round'}
        teamMode={teamMode}/>
    </div>;
   })}
 </div>;
}
