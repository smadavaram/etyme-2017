# frozen_string_literal: true

class Company::SalariesController < Company::BaseController
  require 'sequence'
  before_action :set_salary, only: %i[show pay add_payment]
  add_breadcrumb 'Dashboard', :dashboard_path

  def salary_list
    filter_salary_cycles
  end

  def salary_cycle_filter(cycle_type)
    case cycle_type
    when 'daily'
      { "buy_contracts.sc_day_time": @buy_contract.sc_day_time }
    when 'weekly'
      { "buy_contracts.sc_day_of_week": @buy_contract.sc_day_of_week }
    when 'biweekly'
      { "buy_contracts.sc_day_of_week": @buy_contract.sc_day_of_week, "buy_contracts.sc_2day_of_week": @buy_contract.sc_2day_of_week }
    when 'monthly'
      { "extract(day from buy_contracts.sc_date_1)": @buy_contract.sc_date_1.day }
    when 'twice a month'
      { "extract(day from buy_contracts.sc_date_1)": @buy_contract.sc_date_1.day, "extract(day from buy_contracts.sc_date_2)": @buy_contract.sc_date_2.day }
    end
  end

  def dates
    @start_date.present? && @end_date.present?
  end

  def index
    @tab = params[:tab].present? ? params[:tab] : 'commission'
    add_breadcrumb "#{@tab} Salaries", salaries_path

    @start_date = params[:start_date]
    @end_date = params[:end_date]
    @cycle_type = params[:ts_type]
    if dates
      start = Date.parse(@start_date)
      end_date = Date.parse(@end_date)
      @cycle = nil
    else
      @cycle = params[:cycle]
      start = params[:cycle].present? ? Date.parse(params[:cycle]) : Date.today.beginning_of_month
      end_date = params[:cycle].present? ? Date.parse(params[:cycle]).end_of_month : Date.today.end_of_month
    end
    @contract_cycles = ContractCycle.where(cycle_type: 'SalaryCalculation')
                                    .joins(contract: [:buy_contract])
                                    .joins('INNER JOIN salaries ON salaries.id = contract_cycles.cyclable_id')
                                    .where("contracts.id": current_company.contracts.select(:id))
                                    # .where('contract_cycles.start_date between ? and ? and contract_cycles.end_date between ? and ?', start, end_date, start, end_date)
                                    # .order('created_at')


    SalaryCalculationService.new(current_company).process_salary_cycles(@contract_cycles)
  end

  def show
    cycle_type = @salary.contract_cycle.cycle_frequency
    @buy_contract = @salary.contract_cycle.cycle_of
    @contract_cycles = ContractCycle.where(cycle_type: 'SalaryCalculation').joins(contract: [:buy_contract]).where("contracts.id": current_company.contracts.select(:id)).where(salary_cycle_filter(cycle_type)).where('? between contract_cycles.start_date and contract_cycles.end_date', DateTime.now).where.not("contract_cycles.id": @salary.contract_cycle.id)
  end

  def filter_salary_cycles
    @salary_cycles = ContractCycle.where(contract_id: params[:contract_id], note: 'Salary clear').pluck('date(start_date), date(end_date), contract_id, id')

    @timesheets = {}

    @salary_cycles.each_with_index do |x, y|
      @timesheets[y] = Timesheet.includes(contract: :buy_contracts).where(status: 'approved', start_date: x[0]..x[1], contract_id: params[:contract_id])
      @expenses = Expense.where(bill_type: 'salary_advanced', contract_id: params[:contract_id])
    end
  end

  def final_salary
    if params[:note].present? && params[:cycle_id].present?
      case params[:note]
      when 'Salary clear'
        @salary = Salary.find_by(sclr_cycle_id: params[:cycle_id])
      when 'Salary process'
        @salary = Salary.find_by(sp_cycle_id: params[:cycle_id])
      when 'Salary calculation'
        @salary = Salary.find_by(sc_cycle_id: params[:cycle_id])
      end
      @contracts = current_company.in_progress_contracts.includes(:sell_contract, :buy_contract, :candidate)
      @timesheets = Timesheet.includes(contract: %i[buy_contract sell_contract])
      @salary_expenses = Expense.where(contract_id: current_company.in_progress_contracts.ids, bill_type: 'salary_advanced').where('bill_date BETWEEN ? AND ?', @salary.start_date, @salary.end_date)
      @company_expenses = Expense.where(contract_id: current_company.in_progress_contracts.ids, bill_type: 'company_expense').where('bill_date BETWEEN ? AND ?', @salary.start_date, @salary.end_date)
      @contract_expense_types = ContractExpenseType.all
    else
      redirect_to timeline_contracts_path
    end
  end

  def report
    @ledger = Sequence::Client.new(
      ledger_name: 'company-dev',
      credential: 'OUUY4ZFYQO4P3YNC5JC3GMY7ZQJCSNTH'
    )
    @monthly_salaries = ContractCycle.includes(:candidate, contract: [:buy_contract]).where(note: 'Salary clear', contract_id: current_company.contracts.ids).where('buy_contracts.salary_clear =?', 'monthly').order(start_date: :asc).pluck('date(contract_cycles.start_date), date(contract_cycles.end_date), contract_cycles.contract_id, contract_cycles.id').group_by { |e| [e[0], e[1]] }.map { |c, xs| [c, xs.map { |x| [x[2], x[3]] }] }

    @weekly_salaries = ContractCycle.includes(:candidate, contract: [:buy_contract]).where(note: 'Salary clear', contract_id: current_company.contracts.ids).where('buy_contracts.salary_clear =?', 'weekly').order(start_date: :asc).pluck('date(contract_cycles.start_date), date(contract_cycles.end_date), contract_cycles.contract_id, contract_cycles.id').group_by { |e| [e[0], e[1]] }.map { |c, xs| [c, xs.map { |x| [x[2], x[3]] }] }
    @contracts = current_company.in_progress_contracts.includes(:buy_contract, candidate: [:addresses])
    @timesheets = Timesheet.includes(contract: :buy_contract)
    @expenses = Expense.where(contract_id: current_company.in_progress_contracts.ids)
    @contract_expense_types = ContractExpenseType.all
    @months = Date::ABBR_MONTHNAMES.dup.slice(1, 12)
  end

  def open_salary_process
    @salary = Salary.find_by(sc_cycle_id: params[:sc_cycle_id])
  end

  def update
    @salary = Salary.find_by(id: params[:id])
    @salary.balance = salary_params[:total_amount].to_i - salary_params[:billing_amount].to_i
    @salary.save
    @salary.update(salary_params)
    flash[:notice] = 'Salary Updated'
    redirect_to report_salaries_path
  end

  def calculate_salary
    salary_service.calculate(params[:sclr_cycle_ids])
    flash[:notice] = 'Salary Calculated'
    render js: "window.location = '#{request.headers['HTTP_REFERER']}'"
  end

  def process_salary
    salary_service.process(params[:sclr_cycle_ids])
    flash[:notice] = 'Salary Processed'
    render js: "window.location = '#{request.headers['HTTP_REFERER']}'"
  end

  def aggregate_salary
    csv = Salary.generate_csv(params[:ids])
    respond_to do |format|
      format.csv { send_data csv, file_name: 'aggregate_salary.csv' }
    end
    NotificationMailer.send_csv(csv).deliver if params[:send_mail] == 'true'
    flash.now[:notice] = 'Salary Aggregated'
    # render :js => "window.location = '#{request.headers["HTTP_REFERER"]}'"
  end

  def clear_salary
    salary_service.clear(params[:sclr_cycle_ids])
    flash[:notice] = 'Salary cleared'
    render js: "window.location = '#{request.headers['HTTP_REFERER']}'"
  end

  def pay; end

  def add_payment
    respond_to do |format|
      result = salary_service.add_payment(@salary, params[:payment])
      if result[:success]
        flash.now[:success] = result[:message]
      else
        flash.now[:errors] = result[:errors]
      end
      format.js {}
    end
  end

  def calculate_commission
    salary_service.calculate_commission_accounts(params[:comm_ids], params[:sclr_cycle_ids])
    flash[:notice] = 'Commission calculated'
    render js: "window.location = '#{request.headers['HTTP_REFERER']}'"
  end

  def check_salary_status
    salary = Salary.find_by(sclr_cycle_id: params[:sclr_cycle_id])
    respond_to do |format|
      format.html
      format.json { render json: salary }
    end
  end

  def add_contract_expense_type
    ContractExpenseType.create(contract_expense_type_params)
    redirect_to report_salaries_path(sclr_cycle_id: params[:sclr_cycle_id])
  end

  def delete_contract_expense_type
    ContractExpenseType.find_by(id: params[:id]).destroy
    redirect_to report_salaries_path(sclr_cycle_id: params[:sclr_cycle_id])
  end

  def process_salary_expenses
    salary_service.process_salary_expenses(params[:ids])
    redirect_to salaries_path(tab: 'pay')
  end

  def calculate_salary_commission
    salary_service.calculate_commission_for_salaries(params[:ids])
    flash[:success] = 'Commissions has been calculated and added for further processing'
    redirect_to salaries_path(tab: 'calculate')
  end

  def process_salary_clear
    @salaries = Salary.where(id: params[:ids])
    if @salaries.update_all(status: 'cleared')
      flash[:success] = 'Salary cleared successfully'
      redirect_to salaries_path(tab: 'clearing')
    else
      flash[:errors] = @salaries.errors.full_messages
      redirect_to salaries_path(tab: 'pay')
    end
  end

  def add_contract_addable_expense_amount
    salary_service.add_contract_addable_expense_amounts(params[:ids])
    flash[:success] = 'Contract expenses are calculated'
    redirect_to salaries_path(tab: 'clearing')
  end

  def add_contract_expense_amount
    salary_service.add_contract_expense_amounts(params[:ids])
    flash[:success] = 'Salary calculated successfully'
    redirect_to salaries_path(tab: 'process')
  end

  private

  def salary_params
    params.require(:salary).permit(:balance, :total_amount, :billing_amount, :id)
  end

  def set_salary
    @salary = Salary.find_by(id: params[:id] || params[:salary_id])
  end

  def contract_expense_type_params
    params.require(:contract_expense_type).permit(:name)
  end

  def salary_status_index(tab)
    case tab
    when 'commission', 'calculate'
      [Salary.statuses[:pending], Salary.statuses[:open]]
    when 'process'
      [Salary.statuses[:calculated]]
    when 'pay', 'clearing'
      [Salary.statuses[:processed]]
    end
  end

  def salary_service
    @salary_service ||= SalaryCalculationService.new(current_company)
  end
end
