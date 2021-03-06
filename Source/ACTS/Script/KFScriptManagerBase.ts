import {BlockCache, KFScript, KFScriptContext, KFScriptData} from "./KFScriptDef";
import {KFRegister} from "./ExecCode/KFRegister";
import {KFScriptGroupType} from "./KFScriptGroupType";
import {KFDName} from "../../KFData/Format/KFDName";
import {IKFRuntime} from "../Context/IKFRuntime";
import {KFActor} from "../Actor/KFActor";

export class KFScriptManagerBase implements KFScriptContext
{
    targetObject: KFActor;
    _reg: KFRegister;
    runtime: IKFRuntime;
    block: BlockCache;

    protected _G_SCRIPT_INSTANCE: { [key: number]: KFScript; } = {};
    ///对象脚本池
    protected _T_SCRIPT_POOL:{[key:number]:KFScript[];} = {};

    public constructor()
    {
        this._reg = KFRegister.Create();
        this.block = new BlockCache();
    }

    public Init() {}

    public NewScriptInstance(type:KFDName):KFScript {return null;}
    public DelScriptInstance(script:KFScript) {}

    public Finalize():void
    {
        if (this._reg != null)
        {
            KFRegister.DestoryTop(this._reg);
            this._reg = null;
        }
        this.RemoveAllScripts();
    }

    private RemoveAllScripts():void
    {
        this._G_SCRIPT_INSTANCE = {};
        this._T_SCRIPT_POOL = {};
        ///是否需要Destory脚本呢？
    }

    public CallProperty(name: string, codeline: any): void
    {}

    public ExecCodeLine(codeline: any, target: any): void {
        /// 暂时不支持
    }

    public Execute(sd: any , target: any): void {
        ///设置脚本参数
        let type = sd.type;
        let retval = null;

        /* 这种设置方式太过于难理解先去掉吧
        let sflag = (pints ? pints[0] : KFScriptData.NONE_S);
        let pints:number[] = sd.paramInts;
        if(sflag == KFScriptData.READ_S) {
            ///c++每个脚本自己
            ///readfromstack
            let rfs = KFScriptData.RFS[type.value];
            if(rfs) {rfs(sd,this._reg._OBJECTS,pints);}
        }
        */

        let cacheObject = this.targetObject;
        this.targetObject = target;

        if (sd.group == KFScriptGroupType.Target)
        {
            ///判定是不是TARGET脚本
            if(target.ExecuteScript)
            {
                let retval = target.ExecuteScript(sd, this);
                /*
                ///如果是写有两个参数需要填写
                if(sflag == KFScriptData.WRITE_S) {
                    let wi = pints[1];
                    let isreturn = (wi == -1);
                    if(isreturn){
                        this._reg.ReturnValue(retval,true);
                    } else {
                        this._reg._OBJECTS[wi] = retval;
                    }
                }*/
            }
            return;
        }

        let script:KFScript = this._G_SCRIPT_INSTANCE[type.value];

        if (script == null) {
            script = this.NewScriptInstance(type);
            if (script != null) {
                let sTypes:KFDName[] = script.scriptTypes;
                let count:number = sTypes ? sTypes.length : 0;
                if(count > 0) {
                    for (let i: number = 0; i < count; i++) {
                        this._G_SCRIPT_INSTANCE[sTypes[i].value] = script;
                    }
                }
                else {
                    this._G_SCRIPT_INSTANCE[type.value] = script;
                }
                retval = script.Execute(sd, this);
            }
        }
        else
        {
            retval = script.Execute(sd, this);
        }

        /*
        ///如果是写有两个参数需要填写
        if(sflag == KFScriptData.WRITE_S) {
            let wi = pints[1];
            let isreturn = (wi == -1);
            if(isreturn){
                this._reg.ReturnValue(retval,true);
            } else {
                this._reg._OBJECTS[wi] = retval;
            }
        }
        */
        this.targetObject = cacheObject;
    }

    public ExecuteFrameScript(id: number, fd: any, target: any): void
    {
        let sds:Array<any> = fd.scripts;
        let reg:KFRegister = this._reg;

        if (reg == null)
        {
            for (let i = 0; i < sds.length; i++)
            {
                // Debug.Log("    Trigger-Script 开始执行 -> " + scriptData.scriptType);
                this.Execute(sds[i], target);
            }
        }
        else
        {
            //建立新的寄存器集合
            reg = reg.Push(fd.paramsize, fd.varsize);
            this._reg = reg;
            reg._PC = fd.startPC;
            for (; reg._PC < sds.length;) {
                this.Execute(sds[reg._PC], target);
                reg._PC += 1;
            }
            this._reg = this._reg.Pop();
        }
    }

    public PopRegister(): KFRegister
    {
        let r = this._reg;
        if(r != null) {
           r = r.Pop();
           this._reg = r;
        }
        return r;
    }

    public PushRegister(paramnum: number, varsize: number): KFRegister
    {
        let r = this._reg;
        if (r != null)
        {
            r = r.Push(paramnum, varsize);
            this._reg = r;
            return r;
        }
        return null;
    }

    public BorrowScript(type:KFDName):KFScript {
        let arr = this._T_SCRIPT_POOL[type.value];
        if(arr && arr.length > 0) {
            return arr.pop();
        }
        return this.NewScriptInstance(type);
    }

    public ReturnScript(script: KFScript) {

        if(script == null)
        {
            return;
        }

        let type:KFDName = script._type_;
        let typeval = type.value;
        let arr = this._T_SCRIPT_POOL[typeval];
        if(!arr){
            arr = [];
            this._T_SCRIPT_POOL[typeval] = arr;
        }
        arr.push(script);
    }

    public Get(i: number = 0): any {return this._reg._OBJECTS[i];}
    public Set(i: number, v: any) {this._reg._OBJECTS[i] = v;}


}