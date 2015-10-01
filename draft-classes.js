var Cashflow = {
	namespaces: {},
};

/**
 * Global namespace definitions
 */
(function() {

    /**
     * Registers a namespace with the Cashflow module
     * @param namespace String
     * @param definition Object
     * @return void
     */
    Cashflow.registerNamespace = function(namespace, definition) {
        if (Cashflow.hasOwnProperty(namespace)) {
            throw 'namespace ' + namespace + ' is already registered';
        }
        Cashflow[namespace] = definition;
    };

    Cashflow.registerNamespace('classes', {
        app:{},
        db:{},
        template:{},
    });

    Cashflow.registerNamespace('global', {
    	constants:{},
    	functions:{},
    });

})();

(function () {
	// Constants
	Cashflow.global.constants = {
		dateFormat: 'yyyy/mm/dd',
		numberFormat: '0,0.00',
	};

	// Functions
	Cashflow.global.functions.sumArray = function ( values ) {
		if( !values.length ){
			return 0;
		}
		return values[0] + this.sumArray( values.slice(1) );
	};

	// Classes
	Cashflow.classes.app.ApplicationClass = function () {
		this.init = function () {};
	};

	Cashflow.classes.db.TableClass = function ( tablename ) {
		this.db = Scule.factoryCollection( 'scule+local://' + tablename );
		// this.db.setAutoCommit(true);
	};

	Cashflow.classes.template.RendererClass = function ( template_id ) {
		this.template = {
			selector: "#" + template_id,
		};
	};

	Cashflow.classes.app.Account = function ( budgets, users, entries ) {
		Cashflow.classes.db.TableClass.call(this, 'account');

		// App Instances
		this.budgets = budgets;
		this.users   = users;
		this.entries = entries;

		// Template Setting
		this.template = {
			container: {
				src: "#account-template",
				target: ".account-list",
			},
			list: {
				src: "#account-summary-template",
				target: null,
			},
			detail: {
				src: "#account-detail-template",
				target: null,
			},
		};

		// setup method called after definition
		this.setup = function () {
			if ( !this.users.getActiveUser() ) {
				return;
			}
			// prepare accounts summary
			var accounts = _.sortBy( this.db.findAll(), function(row){ return row.name; } ),
				budget   = this.getBudget();
			this.assignAccountsAllocation( accounts, budget );
			this.assignAccountsTotalExpense( accounts, budget );
			this.assignAccountsProgressBarStyles( accounts );

			// render account summary list
			var template_str = this.getAccountTemplateString( this.template ),
				target_elem  = $( this.template.container.target );

			target_elem.html(
				this.renderAccountsList( template_str, accounts )
			);

			return target_elem;
		};

		this.assignAccountsAllocation = function ( accounts, budget ) {
			if ( accounts.length == 0 ) {
				return;
			};

			// assign allocation
			accounts[0].allocation = 
				this.getBudgetAllocation( budget.accounts, accounts[0]._id.toString() );

			// recursive call
			return this.assignAccountsAllocation(
				accounts.slice(1),
				budget
			);
		};

		this.assignAccountsTotalExpense = function ( accounts, budget ) {
			if ( accounts.length == 0 ) {
				return;
			};

			// assign total expense
			accounts[0].total_expense = 
				this.getAccountTotalExpense( accounts[0], budget );

			// recursive call
			return this.assignAccountsTotalExpense(
				accounts.slice(1),
				budget
			);
		};

		this.assignAccountsProgressBarStyles = function ( accounts ) {
			if ( accounts.length == 0 ) {
				return;
			};

			accounts[0].progress = this.getAccountProgressBarStyles( accounts[0] );

			// recursive call
			return this.assignAccountsProgressBarStyles(
				accounts.slice(1)
			);
		};

		this.getAccountProgressBarStyles = function ( account ) {
			var progress, progress_percentage; 

			progress_percentage = this.calculatePercentage(
				account.total_expense,
				account.allocation
			);

			progress = {
				percentage: progress_percentage,
				color     : this.calculateColorStyle(
					progress_percentage.value, progress_percentage.isOverflow
				),
				overflow_class : this.calculateOverflowClass( progress_percentage.isOverflow ),
			};

			return progress;
		};

		this.getAccountTotalExpense = function ( account, budget ) {

			var account_budgeted_entries = this.entries.findAccountBudgetRange(
				account._id.toString(),
				budget.date.start,
				budget.date.end
			);

			// assign total expense
			return this.entries.getAmountSum( account_budgeted_entries );
		};

		this.renderAccountsList = function ( template_str, accounts ) {
			if ( accounts.length == 0 ) {
				return '';
			};

			// render account string
			return this.renderAccountList( accounts[0], template_str ) +
				this.renderAccountsList( template_str, accounts.slice(1) );
		};

		this.renderAccountList = function ( account, template_str ) {

			return template_str
				.replace( /{{account.id}}/g, account._id.toString() )
				.replace( /{{account.name}}/g, account.name )
				.replace( /{{account.allocation}}/g, account.allocation )
				.replace( /{{account.total_expense}}/g, account.total_expense )
				.replace( /{{account.progress.usage_percentage}}/g, account.progress.percentage.value )
				.replace( /{{account.progress.overflow_class}}/g, account.progress.overflow_class )
				.replace( /{{account.progress.color}}/g, account.progress.color )
				.replace( /{{account.balance}}/g, account.allocation - account.total_expense );

			// clean rendered string - remove unrendered fields
			// rendered_str = rendered_str.replace( /{{[\S]+}}/,'' );
		};

		this.calculatePercentage = function ( expense, allocation ) {
			var base_percentage, overflow_percentage, final_percentage;
			// calculate percentages
			base_percentage     = ( expense/allocation ) * 100;
			overflow_percentage = ( base_percentage  > 100 ) ? ( (expense-allocation)/allocation ) * 100 : 0;
			// use overflow percentage if expense is greater than allocation
			final_percentage    = ( base_percentage  > 100 ) ? overflow_percentage : base_percentage;
			// use 100% as max percentage
			final_percentage    = ( final_percentage > 100 ) ? 100 : final_percentage;

			return {
				value: final_percentage,
				isOverflow: !!overflow_percentage
			};
		};

		this.calculateOverflowClass = function ( is_overflow ) {
			return ( is_overflow ) ? 'right' : 'left';
		};

		this.calculateAlignmentStyle = function ( is_overflow ) {
			return ( is_overflow ) ? 'right' : 'left';
		};

		this.calculateColorStyle = function ( percentage, is_overflow ) {
			// 'success' 'warning' 'danger';
			return ( is_overflow ) ? 'danger' : 
				// else
				( percentage > 75 ) ? 'warning' : 'success';
		};

		this.getAccountTemplateString = function ( template ) {
 			var main_template = $( template.container.src ).html();
 			var summary_template = $( template.list.src ).html();
			
			return main_template.replace( /{{account.summary}}/g, summary_template );
		};

		this.renderAccountEntriesList = function ( account_id, target_elem ) {
			var budget  = this.getBudget();
			var entries = _.sortBy(
					this.entries.findAccountBudgetRange(
						account_id,
						budget.date.start,
						budget.date.end
					), function(row){
						return new Date( row.date.used );
				});

			var template_str = $(this.template.detail.src).html();
			target_elem.html(
				this.entries.renderEntriesList( template_str, target_elem, entries )
			);

			return target_elem;
		};

		this.renderAccount = function ( account, budget, template_str ,target_elem, closure ) {
			// assign derived attributes
			account.total_expense = this.getAccountTotalExpense( account, budget );
			account.allocation    = this.getBudgetAllocation( budget.accounts, account._id.toString() );
			account.progress      = this.getAccountProgressBarStyles( account );

			// render template
			var rendered_account = this.renderAccountList( account, template_str );
			return closure( target_elem, rendered_account );
		};

		this.renderAccountSummary = function ( account_id, target_elem ) {
			// prepare account summary
			var account = this.getAccount( account_id ),
				budget  = this.getBudget(),
				template_str = $( this.template.list.src ).html();

			return this.renderAccount(
				account, budget, template_str ,target_elem, 
				function ( target_elem, rendered_account ) {
					return target_elem.html( rendered_account );
				});
		};

		this.renderNewAccount = function ( account_id, target_elem ) {
			// prepare new account
			var account = this.getAccount( account_id ),
				budget  = this.getBudget(),
				template_str = this.getAccountTemplateString( this.template );

			return this.renderAccount(
				account, budget, template_str ,target_elem, 
				function ( target_elem, rendered_account ) {
					return $( rendered_account ).appendTo( target_elem );
				});
		}

		this.getBudgetAllocation = function ( budget_accounts, account_id ) {
			if ( !budget_accounts.length ) {
				// default budget is zero
				return 0;
			};

			var current_budget = budget_accounts[0];

			// match account budget
			if ( current_budget.id == account_id ) {
				return current_budget.allocation;
			}else{
				// recursive call
				return this.getBudgetAllocation(
					budget_accounts.slice(1),
					account_id
				);
			}
		};

		this.getBudget = function () {
			return this.budgets.getBudget( this.users.getActiveUserSettings('budget').id );
		};

		this.getAccount = function ( account_id ) {
			return this.db.findOne( account_id );
		};

		this.create = function ( account ) {
			if ( this.validate( account ) ) {
				account.name = account.name.toUpperCase();
				return this.db.save( account );
			} else{
				return false;
			};
		};

		this.update = function ( account, account_id ) {
			if ( this.validate( account ) ) {
				return this.db.update( {_id: account_id }, {
					$set: account
				},{},true);
			} else{
				return false;
			};
		};

		this.validate = function ( account ) {
			// check for required fields
			return account.name && account.description;
		};

		// call to setup method
		this.setup();
	};

	Cashflow.classes.app.Entry = function () {
		Cashflow.classes.db.TableClass.call(this, 'entry');

		// Template Setting
		this.template = {
			list: {
				src: "#account-detail-template",
				target: null,
			},
		};

		this.renderEntriesList = function ( template_str, target_elem, entries ) {
			var rendered_str = '';

			entries.forEach(function ( entry ) {
				var tmp_str = "";
				tmp_str = template_str
					.replace( /{{entry.id}}/g, entry._id )
					.replace( /{{entry.description}}/g, entry.description )
					.replace( /{{entry.amount}}/g, numeral(entry.amount)
						.format( Cashflow.global.constants.numberFormat )
					);
				rendered_str += tmp_str;
			});

			// clean rendered string - remove unrendered fields
			// rendered_str = rendered_str.replace( /{{[\S]+}}/,'' );

			return rendered_str;
		};

		this.getEntry = function ( entry_id ) {
			return this.db.findOne( entry_id );
		}

		this.findBudgetRange = function ( start_date, end_date ) {
			return this.db.find({
				'date.used':{
					$gte: start_date,
					$lte: end_date
				}
			});
		};

		this.findAccountBudgetRange = function ( account_id, start_date, end_date ) {
			return this.db.find({
				'account.id': account_id,
				'date.used': {
					$gte: start_date,
					$lte: end_date
				}
			});
		};
 
		this.getAmountSum = function ( entries ) {
			if( !entries.length ){
				return 0;
			}

			if( entries.length == 1 ){
				return entries[0].amount;
			}

			return entries[0].amount + this.getAmountSum( entries.slice(1) );
		};

		this.create = function ( entry ) {
			if ( this.validate( entry ) ) {
				entry.amount = parseInt( entry.amount );
				return this.db.save( entry );
			} else{
				return false;
			};
		};

		this.update = function ( entry, entry_id ) {
			if ( this.validate( entry ) ) {
				entry.amount = parseInt( entry.amount );
				return this.db.update( {_id: entry_id }, {
					$set: entry
				},{},true);
			} else{
				return false;
			};
		};

		this.validate = function ( entry ) {
			// check for required fields
			return entry.description &&
				entry.amount &&
				entry.date.used && 
				entry.account.id && 
				entry.user.id;
		};
	};

	Cashflow.classes.app.Budget = function () {
		Cashflow.classes.db.TableClass.call(this, 'budget');

		this.getBudget = function ( budget_id ) {
			return this.db.findOne( budget_id );
		};

		this.create = function ( budget ) {
			if ( this.validate( budget ) ) {
				return this.db.save( budget );
			} else{
				return false;
			};
		};

		this.validate = function ( budget ) {
			// check for required fields
			return budget.accounts.length && //array 
				budget.accounts[0].allocation &&
				budget.accounts[0].id &&
				budget.date.start && 
				budget.date.end &&
				budget.name;
		};
	};

	Cashflow.classes.app.User = function () {
		Cashflow.classes.db.TableClass.call(this, 'user');

		this.getActiveUser = function () {
			var active_user = this.db.find( {active:true} );

			if ( active_user.length != 1 ) {
				// throw "Active user query should return exactly 1 result";
				return false;
			};

			return active_user[0];
		};

		this.getActiveUserId = function (argument) {
			return this.getActiveUser()._id.toString();
		};

		this.getUserSettings = function ( user, name ) {
			if ( name ) {
				return user.settings[ name ];
			}
			return user.settings;
		};

		this.getActiveUserSettings = function ( name ) {
			return this.getUserSettings( this.getActiveUser(), name );
		};

		this.create = function ( user ) {
			if ( this.validate( user ) ) {
				return this.db.save( user );
			} else{
				return false;
			};
		};

		this.validate = function ( user ) {
			// check for required fields
			return user.name;
		};

	};

})();
