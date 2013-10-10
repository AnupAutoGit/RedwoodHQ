
Ext.define('Redwood.view.ResultsView', {
    extend: 'Ext.panel.Panel',
    alias: 'widget.resultsview',
    overflowY: 'auto',
    bodyPadding: 5,
    dataRecord: null,
    viewType: "Results",

    refreshHeight: function(){
        var grid = this.down("#resultsGrid");
        grid.resetHeight(grid);
    },
    listeners:{
        afterrender: function(me){
            if (me.dataRecord.testcase.script){
                me.down("#results").hide();
                me.down("#error").show();
                me.down("#trace").show();
            }
        }
    },

    lastResult: {},

    refreshResult: function(result){
        var me = this;
        var resultNodes = [];
        var cascadeResult = function(nodes){
            nodes.forEach(function(node){
                resultNodes.push(node);
                if((node.children) && (node.children.length > 0)){
                    cascadeResult(node.children);
                }
            })
        };
        cascadeResult(result.children);
        var index = 0;
        this.resultsStore.getRootNode().cascadeBy(function(node){
            if(!node.isRoot()){
                node.set("result",resultNodes[index].result);
                node.set("status",resultNodes[index].status);
                node.set("parameters",resultNodes[index].parameters);
                node.set("error",resultNodes[index].error);
                node.set("screenshot",resultNodes[index].screenshot);
                node.set("trace",resultNodes[index].trace);
                if(resultNodes[index].expanded == true){
                    node.expand();
                    me.down("#resultsGrid").resetHeight(me.down("#resultsGrid"));
                }
                else{
                    //node.collapse();
                }
                index++;
            }
        });

        /*
        var lastNode = null;
        if(result.children.length == 0) return;
        this.resultsStore.getRootNode().cascadeBy(function(node){
            if (!node.isRoot()){
                var matchedNode = null;
                if(lastNode == null){
                    lastNode = result.children[0];
                    lastNode.parent = result;
                    matchedNode = lastNode;
                }
                else{
                    if(lastNode.parent.children.length == 0){
                        var findNextNode = function(parent){

                        };

                        for(var i = 0;i<lastNode.parent.children.length;i++){
                            if(lastNode == lastNode.parent.children[i]){

                            }
                        }
                    }
                    else{
                        matchedNode = lastNode.children[0];
                        matchedNode.parent = lastNode;
                        lastNode = matchedNode;
                    }
                }

                node.set("result",matchedNode.result);
                node.set("status",matchedNode.status);
                node.set("parameters",matchedNode.parameters);
                node.set("error",matchedNode.error);
                node.set("screenshot",matchedNode.screenshot);
                node.set("trace",matchedNode.trace);
                if(matchedNode.expanded == true){
                    node.expand();
                }
                else{
                    node.collapse();
                }
            }
        });
        /*
        me.lastResult = {};
        var index = 0;
        this.resultsStore.getRootNode().cascadeBy(function(node){
            me.lastResult[index] = node.isExpanded();
            index++;
        });
        this.resultsStore.setRootNode({"text":".","children":result.children});
        this.down("#status").setValue(result.status);
        this.down("#result").setValue(result.result);
        index = 0;
        this.resultsStore.getRootNode().cascadeBy(function(node){
            if(me.lastResult[index] === true){
                node.expand();
            }
            index++;
        });
        */
    },

    initComponent: function () {
        var me = this;

        me.resultsStore =  Ext.create('Ext.data.TreeStore', {
            storeId: "Results"+this.itemId,
            idProperty: 'name',
            fields: [
                {name: 'name',     type: 'string'},
                {name: 'actionid',     type: 'string'},
                {name: 'order',     type: 'string'},
                {name: 'paramvalue',     type: 'string'},
                {name: 'parameters',     type: 'array'},
                {name: 'result',     type: 'string'},
                {name: 'error',     type: 'string'},
                {name: 'trace',     type: 'string'},
                {name: 'screenshot',     type: 'string'},
                {name: 'status',     type: 'string'}
            ]
        });

        var transformed = me.dataRecord.testcase.children;

        me.resultsStore.setRootNode({"text":".","children":transformed });

        var resultsTree = Ext.create('Ext.tree.Panel', {
            rootVisible: false,
            store: me.resultsStore,
            cls:"x-redwood-alternative-tree-row-even x-redwood-alternative-tree-row-odd",
            height:700,
            //minHeight:1600,
            //managerHeight:true,
            //autoHeight: true,
            itemId:"resultsGrid",
            viewConfig: {
                markDirty: false,
                enableTextSelection: true
            },

            listeners:{
                afterrender: function(me){
                    me.resetHeight(me);
                    //me.getView().updateLayout();
                },
                load: function(me){
                    //me.resetHeight(me);
                    //me.getView().updateLayout();
                },
                itemexpand: function(me){
                    this.resetHeight(this);
                },
                itemcollapse: function(me){
                    this.resetHeight(this);
                }
            },

            resetHeight: function(cmp){
                setTimeout(function(){
                    var innerElement = cmp.getEl().down('table.x-grid-table');
                    if(innerElement){
                        var height = innerElement.getHeight();
                        if(height > 700){
                            cmp.setHeight(700);
                        }
                        else{
                            cmp.setHeight(height+50);
                        }

                        //var width = innerElement.getWidth();
                        //cmp.setWidth(width);
                    }
                }, 300);
            },

            multiSelect: false,
            columns: [
                {
                    header: 'Order',
                    width:40,
                    sortable: false,
                    dataIndex: 'order',
                    renderer: function(value,meta,record){
                        //return "<a style= 'color: blue;' href='javascript:openAction(&quot;"+ record.get("actionid") +"&quot;)'>" + value +"</a>";
                        if (record.get("parentId") == "root"){
                            return value;
                        }
                        else{
                            return "";
                        }
                    }
                },

                {
                    xtype: 'treecolumn',
                    header: 'Action Name',
                    //flex: 2,
                    width:300,
                    sortable: false,
                    dataIndex: 'name',
                    renderer: function(value,meta,record){
                        return "<a style= 'color: blue;' href='javascript:openAction(&quot;"+ record.get("actionid") +"&quot;)'>" + value +"</a>";
                    }
                },

                {
                    header: 'Parameters',
                    //flex: 2,
                    width:450,
                    sortable: false,
                    dataIndex: 'parameters',
                    renderer: function(value,meta,record){
                        if (!value) return "";
                        if (value.length == 0) return "";
                        var rows = "";
                        value.forEach(function(param){
                            rows += '<div style="display:table-row;">'+
                                    '<span style="display:table-cell; padding: 3px; border: 1px solid #8b8b8b; font-weight: bold;width:100px;white-space: normal;word-wrap: break-word;">'+param.paramname+'</span>'+
                                    '<span style="display:table-cell; padding: 3px; border: 1px solid #8b8b8b;width:250px;white-space: normal;word-wrap: break-word;">'+param.paramvalue+'</span>'+
                                '</div>';
                        });
                        var table = '<div style="display:table;table-layout: fixed;width: 100%;">'+ rows +'</div>';

                        return table;
                    }
                    //dataIndex: 'paramvalue'
                },
                {
                    header: 'Status',
                    sortable: false,
                    dataIndex: 'status',
                    renderer: function (value, meta, record) {
                        if(record.get("host") && (value == "Running")){
                            return "<a style= 'color: blue;font-weight: bold;' href='javascript:vncToMachine(&quot;"+ record.get("host") +"&quot;,&quot;"+ record.get("vncport") +"&quot;)'>" + value +"</a>";
                        }
                        else if (value == "Finished"){
                            return "<p style='color:green;font-weight: bold;'>"+value+"</p>";
                        }
                        else if ( value == "Not Run"){
                            return "<p style='color:#ffb013;font-weight: bold;'>"+value+"</p>";
                        }
                        else{
                            return value;
                        }
                    }
                },
                {
                    header: 'Result',
                    dataIndex: "result",
                    renderer: function(value,meta,record){

                        if (value == "Passed"){
                            return "<p style='color:green;font-weight: bold;'>"+value+"</p>"
                        }
                        else if (value == "Failed"){
                            return "<p style='color:red;font-weight: bold;'>"+value+"</p>"
                        }
                        else{
                            return value;
                        }

                    }
                },
                {
                    header: 'Error',
                    dataIndex: "error",
                    width:240,
                    renderer: function(value,meta,record){
                        meta.tdCls = 'x-redwood-results-cell';
                        return "<p style='color:red;font-weight: bold;'>"+value+"</p>";
                    }
                },
                {
                    header: 'Screen Shot',
                    dataIndex: "screenshot",
                    width:80,
                    renderer: function(value,meta,record){
                        meta.tdCls = 'x-redwood-results-cell';
                        if(value){
                            return "<a style= 'color: blue;' href='javascript:openScreenShot(&quot;"+ value +"&quot;)'>View</a>";
                        }
                        else{
                            return ""
                        }
                    }
                },
                {
                    header: 'Trace',
                    dataIndex: "trace",
                    flex:1,
                    //width: 800,
                    renderer: function(value,meta,record){
                        meta.tdCls = 'x-redwood-results-cell';
                        return "<p>"+value+"</p>"
                    }
                }
            ]
        });

        this.logStore =  Ext.create('Ext.data.Store', {
            storeId: "ResultLogs"+this.itemId,
            idProperty: '_id',
            fields: [
                {name: 'actionName',     type: 'string'},
                {name: 'message',     type: 'string'},
                {name: 'date',     type: 'date'}
            ],
            sorters: [{
                property : 'date',
                direction: 'ASC'
            }],
            data:[]
        });

        me.dataRecord.logs.forEach(function(log){
            //var timestamp = log._id.substring(0,8);
            me.logStore.add({message:log.message,actionName:log.actionName,date:log.date});
            //logStore.add({message:log.message,actionName:log.actionName,date:new Date( parseInt( timestamp, 16 ) * 1000 )})
        });

        var logGrid = Ext.create('Ext.grid.Panel', {
            store: me.logStore,
            itemId:"executionLogs",
            selType: 'rowmodel',
            viewConfig: {
                markDirty: false,
                enableTextSelection: true
            },
            columns:[
                {
                    header: 'Action Name',
                    dataIndex: 'actionName',
                    width: 200
                },
                {
                    xtype:"datecolumn",
                    format:'m/d h:i:s',
                    header: 'Date',
                    dataIndex: 'date',
                    width: 100
                },
                {
                    header: 'Message',
                    dataIndex: 'message',
                    flex: 1,
                    renderer: function(value,meta,record){
                        meta.tdCls = 'x-redwood-results-cell';
                        return "<p>"+value+"</p>"
                    }
                }

            ]

        });

        var screenShots = Ext.create('Ext.panel.Panel', {
            layout: 'card',
            height:400,
            bodyStyle: 'padding:15px',
            itemId:"screenShots",
            defaults: {
                // applied to each contained panel
                border: false
            },
            tbar: [
                {
                    id: 'move-prev',
                    text: 'Back',
                    handler: function(btn) {
                        if(screenShots.getLayout().getPrev()){
                            me.lastScrollPos = me.getEl().dom.children[0].scrollTop;
                            screenShots.getLayout().prev();
                            resultsTree.getSelectionModel().select(screenShots.getLayout().getActiveItem().node);
                            me.getEl().dom.children[0].scrollTop = me.lastScrollPos;
                        }
                    }
                },
                '->', // greedy spacer so that the buttons are aligned to each side
                {
                    id: 'move-next',
                    text: 'Next',
                    handler: function(btn) {
                        if(screenShots.getLayout().getNext()){
                            me.lastScrollPos = me.getEl().dom.children[0].scrollTop;
                            screenShots.getLayout().next();
                            resultsTree.getSelectionModel().select(screenShots.getLayout().getActiveItem().node);
                            me.getEl().dom.children[0].scrollTop = me.lastScrollPos;
                        }
                        //screenShots.add({
                            //id: 'card-2',
                        //    html: '<h1>HAHAHAHAHAHAHAH!</h1><p>Step 3 of 3 - Complete</p>'
                        //})
                    }
                }
            ],
            items: [],
            renderTo: Ext.getBody()
        });

        this.resultsStore.getRootNode().cascadeBy(function(node){
            if(!node.isRoot()){
                if(node.get("screenshot")){
                    var html = "<h1>"+node.getPath("name")+"</h1>";
                    //location.protocol + "//" + location.host +"/screenshots/"+id
                        html = html + '<p><a href="javascript:openScreenShot(&quot;'+ node.get("screenshot") +'&quot;)"><img src="'+location.protocol + "//" + location.host +"/screenshots/"+node.get("screenshot") +'" height="360"></a></p>'
                    screenShots.add({
                        node: node,
                        html: html
                    })
                }
            }
        });

        this.items = [
            {
                xtype: 'fieldset',
                title: 'Details',
                defaultType: 'displayfield',
                flex: 1,
                collapsible: true,
                defaults: {
                    flex: 1
                },
                items: [
                    {
                        fieldLabel: "Name",
                        labelStyle: "font-weight: bold",
                        style:"font-weight: bold",
                        itemId:"name",
                        value:"<a style= 'color:font-weight:bold;blue;' href='javascript:openTestCase(&quot;"+ me.dataRecord.testcase.testcaseID +"&quot;)'>" + me.dataRecord.testcase.name +"</a>",
                        anchor:'90%'
                    },
                    {
                        fieldLabel: 'Status',
                        labelStyle: "font-weight: bold",
                        itemId:"status",
                        value:me.dataRecord.testcase.status,
                        anchor:'90%',
                        renderer: function (value) {
                            if(value == "Running"){
                                //return "<a style= 'color:font-weight:bold;blue;' href='javascript:vncToMachine(&quot;"+ record.get("host") +"&quot;)'>" + value +"</a>";
                                return "<p style='font-weight:bold;color:blue'>"+value+"</p>"
                            }
                            else if (value == "Finished"){
                                return "<p style='font-weight:bold;color:green'>"+value+"</p>";
                            }
                            else if ( value == "Not Run"){
                                return "<p style='font-weight:bold;color:#ffb013'>"+value+"</p>";
                            }
                            else{
                                return value;
                            }
                        }
                    },
                    {
                        fieldLabel: "Result",
                        labelStyle: "font-weight: bold",
                        itemId:"result",
                        value:me.dataRecord.testcase.result,
                        anchor:'90%',
                        renderer: function(value,field){
                            if (value == "Passed"){
                                return "<p style='font-weight:bold;color:green'>"+value+"</p>"
                            }
                            else if (value == "Failed"){
                                return "<p style='font-weight:bold;color:red'>"+value+"</p>"
                            }
                            else{
                                return value;
                            }
                        }
                    },
                    {
                        fieldLabel: "Error",
                        labelStyle: "font-weight: bold",
                        hidden: true,
                        maxWidth: 500,
                        itemId:"error",
                        value:me.dataRecord.testcase.error,
                        anchor:'90%',
                        renderer: function(value,field){
                            return "<p style='font-weight:bold;color:red'>"+value+"</p>"
                        }
                    },
                    {
                        fieldLabel: "Trace",
                        labelStyle: "font-weight: bold",
                        hidden: true,
                        itemId:"trace",
                        //maxWidth: 500,
                        minWidth:300,
                        value:me.dataRecord.testcase.trace,
                        anchor:'90%'
                    }

                ]
            },
            {
                xtype: 'fieldset',
                title: 'Screen Shots',
                flex: 1,
                type: 'hbox',
                itemId:"screenShotsPanel",
                //minHeight:600,
                constrainAlign: true,
                collapsible: true,
                //collapsed: true,
                defaults: {
                    flex: 1
                },
                items:[
                    screenShots
                ]
            },
            {
                xtype: 'fieldset',
                title: 'Results',
                itemId:"results",
                flex: 1,
                type: 'hbox',
                //minHeight:600,
                constrainAlign: true,
                collapsible: true,
                defaults: {
                    flex: 1
                },
                items:[
                    resultsTree
                ]
            },
            {
                xtype: 'fieldset',
                title: 'Logs',
                flex: 1,
                itemId:"logs",
                //minHeight:600,
                collapsible: true,
                defaults: {
                    flex: 1
                },
                items:[
                    logGrid
                ]
            }
        ];

        this.callParent(arguments);
        setTimeout(function(){me.down("#screenShotsPanel").collapse();},100);

    }

});