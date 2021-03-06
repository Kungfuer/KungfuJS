import {IKFRuntime} from "./IKFRuntime";
import {KFDName} from "../../KFData/Format/KFDName";
import {KFEvent, KFEventTable} from "../../Core/Misc/KFEventTable";
import {KFDJson} from "../../KFData/Format/KFDJson";
import {KFBytes} from "../../KFData/Format/KFBytes";
import {KFGlobalDefines} from "../KFACTSDefines";
import {KFByteArray} from "../../KFData/Utils/FKByteArray";
import {kfVector3, SDBlockTargetRef, SDInt32, SDString} from "../Script/Global/GlobalScripts";
import {KFAttribflags} from "../../KFData/Format/KFAttribflags";
import {KFScriptGroupType} from "../Script/KFScriptGroupType";
import {KFEventDispatcher} from "../Event/KFEventDispatcher";

export interface IKFBlockTargetContainer
{
    parent:IKFBlockTargetContainer;
    ChildRename(oldname:number, child:KFBlockTarget):void;
    GetChildren():KFBlockTarget[];
    AddChild(child:KFBlockTarget):void;
    RemoveChild(child:KFBlockTarget):void;
    GetChildAt(index:number):KFBlockTarget;
    FindChildBySID(sid:number):KFBlockTarget;
    FindChild(name:number):KFBlockTarget;
    StrChild(name:string):KFBlockTarget;
    GetRuntime():IKFRuntime;
    CreateChild(targetdata:any,meta?:any,Init?:any,search?:boolean):KFBlockTarget;
    DeleteChild(child:KFBlockTarget):boolean;
    ///直接删除不建议用
    _DeleteChild(child:KFBlockTarget):boolean;
}

///在哪一端执行
export class BlkExecSide
{
    static UNKNOW:number = 0;
    static CLIENT:number = 1;
    static SERVER:number = 2;
    static BOTH:number = 3;
    static SELFCLIENT:number = 5;///自己的客户端
};


export class KFBlockTarget
{
    ///名称
    public name:KFDName;
    public metadata:any;
    public sid:number;
    ///是否属于主客户端
    public owner:boolean;
    public parent:IKFBlockTargetContainer;
    ///创建对象的节点名,没有为空
    public ownerNode:KFDName;

    public etable:KFEventDispatcher;
    public runtime:IKFRuntime;

    ///是否需要TICK
    public tickable:boolean;

    ///变量
    public vars:{[key:number]:any};

    public Construct(metadata:any, runtime:IKFRuntime, initBytes?:KFByteArray)
    {
        this.metadata = metadata;
        this.runtime = runtime;
        this.vars = {};

        ///如果有MEATDATA数据则给对象赋值
        ///不考虑延时创建的对象了[不纯粹]，METADATA就是类初始化时赋值的
        ///需要考虑下如果是频繁创建的对象的性能问题？

        if(!initBytes)
        {
            let kfbytes: KFBytes = this.metadata.data;
            initBytes = kfbytes ? kfbytes.bytes : null;
        }

        if(initBytes)
        {
            initBytes.SetPosition(0);
            KFDJson.read_value(initBytes,false, this);
        }
    }

    public get Ref():SDBlockTargetRef
    {
        let targetRef:SDBlockTargetRef = new SDBlockTargetRef();
        targetRef.value = this;
        return targetRef;
    }

    //Release():void{}

    public EditTick(frameindex:number):void{}
    public Tick(frameindex:number):void{}

    public ActivateBLK(KFBlockTargetData:any):void
    {
        if(KFGlobalDefines.IS_Debug)
        {
            let self = <any>this;
            self.CreateTargetData = KFBlockTargetData;
        }
    }

    public DeactiveBLK():void { }


    ///这些属性都可以定义成函数访问

    public visible:boolean;
    public display:number;
    public position:kfVector3;
    public rotation:kfVector3;
    public scale:kfVector3;

    public set_display(v:number, bJumpFrame:boolean = false){}

    ///更新显示对象
    public set_position(v3?: { x: number; y: number; z?: number }){}
    ///更新显示对象
    public set_rotation(v3?: { x?: number; y?: number; z: number }){}
    ///更新显示对象
    public set_scale(v3?:{x:number,y:number,z?:number}){}
    ///更新显示对象
    public set_datas(datas:number[]){}

    public StrVar(name:string):any
    {
        return this.vars[KFDName._Strs.GetNameID(name)];
    }

    public StrValue(name:string):any
    {
        let varx = this.vars[KFDName._Strs.GetNameID(name)];
        return varx? varx.getValue() : null;
    }

    public AddVar(varname:string, type:number = 0, netvar:boolean = true)
    {
        if(this.vars == null) {
            this.vars = {};
        }

        let nameval:number = KFDName._Strs.GetNameID(varname);
        let varitem:any = this.vars[nameval];

        if(varitem)
        {
            return varitem;
        }

        switch (type)
        {
            case 0:
                varitem = new SDInt32();
                break;
            case 1:
                varitem = new SDString();
                break;
        }

        if(netvar)
        {
            varitem.group = KFScriptGroupType.NetVar;
            varitem.UpdateEvent = this.OnNetVarUpdate.bind(this, varname);
        }

        this.vars[nameval] = varitem;
        return varitem;
    }

    public RemoveVar(varname:string)
    {
        let nameval:number = KFDName._Strs.GetNameID(varname);
        if(this.vars && this.vars[nameval])
        {
            let strvar:SDString = SDString.Share;
            strvar.value = varname;
            this.FireEvent("OnVarRemoved",strvar);
            delete this.vars[nameval];
        }
    }

    public ReadVars(bytesarr:KFByteArray,len:number)
    {
        if(this.vars == null) this.vars = {};
        let varsize = bytesarr.readvaruint();
        while (varsize > 0)
        {
            let varname:string = bytesarr.readstring();
            let nameval = KFDName._Strs.GetNameID(varname);
            let data = KFDJson.read_value(bytesarr);

            let valueobj:any = this.vars[nameval];
           if(valueobj)
           {
               valueobj.setValue(data);
           }
           else
           {
               this.vars[nameval] = data;
               ///如果是网络变量需要有事件通知
               if(data.group == KFScriptGroupType.NetVar)
               {
                   data.UpdateEvent = this.OnNetVarUpdate.bind(this, varname);
               }
           }

           varsize -= 1;
        }
    }

    public OnNetVarUpdate(varname:string, arg:any):void
    {
        let strvar:SDString = SDString.Share;
        strvar.value = varname;
        this.FireEvent("OnVarUpdate",strvar);
        let varevent = "ON_" + varname;
        this.FireEvent(varevent, arg);
    }

    public WriteVars(bytesarr:KFByteArray, attribFlags?:KFAttribflags) {

        if(this.vars) {

            let arr = [];

            if(attribFlags){

                //略过不需要写的属性
                for (let key in attribFlags) {

                    let attribFlag:KFAttribflags = attribFlags[key];
                    if(attribFlag._w_ == false) {
                        continue;
                    }
                    else if(attribFlag._w_){
                        //_w_可写
                        //已经写过就重置属性状态
                        attribFlag._w_ = false;
                    }

                    arr.push({
                            name: KFDName._Strs.GetNameStr(parseInt(key))
                        ,   value: this.vars[key]
                        ,   attrFlag: attribFlag
                    });
                }

            } else {

                for (let key in this.vars) {
                    arr.push({
                        name: KFDName._Strs.GetNameStr(parseInt(key))
                        , value: this.vars[key]
                    });
                }
            }

            bytesarr.writevaruint(arr.length);

            for(let itm of arr){
                bytesarr.writestring(itm.name);
                KFDJson.write_value(bytesarr, itm.value, null, itm.attrFlag);
            }

        } else {
            bytesarr.writevaruint(0);
        }
    }

    public VarsCopyTo(t:KFBlockTarget, autocreate:boolean = false)
    {
        for(let key in this.vars)
        {
            let onevar:any = t.vars[key];
            let orgvar:any = this.vars[key];
            let orgval:any = orgvar;

            if(orgvar.Clone)
            {
                orgval = orgvar.Clone();
            }

            if(onevar)
            {
                onevar.setValue(orgval);
            }
            else if(autocreate)
            {
                onevar = new orgvar.constructor();
                t.vars[key] = onevar;
                onevar.setValue(orgval);
            }
        }
    }

    public FireEvent(event:string, arg:any = null, global:boolean = false):void
    {
        let etable:KFEventTable = null;
        if (!global) {
           etable = this.etable;
        }
        else {
            etable = this.runtime.etable;
        }
        if (etable) {
            let ShareEvent:KFEvent = KFEvent.ShareEvent;
            ShareEvent.type.value = KFDName._Strs.GetNameID(event);
            ShareEvent.arg = arg;
            etable.FireEvent(ShareEvent);
        }
    }

    public Destory() {
        if(this.parent) {
            this.parent.DeleteChild(this);
        }
    }

}


///节点数据
export interface IKFNodeData
{
    CopyTo(dest:IKFNodeData);
}
