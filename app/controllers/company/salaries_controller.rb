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
    @tab = params[:tab].present? ? params[:tab] : 'calculate'
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
                                    .where('contract_cycles.start_date between ? and ? and contract_cycles.end_date between ? and ?', start, end_date, start, end_date)
                                    .order('created_at')
    @contract_cycles.each do |cc|
      next unless %i[pending open].include?(cc.cyclable.status.to_sym)

      timesheets = Timesheet.approved.joins(:contract_cycle)
                            .where("contract_cycles.contract_id": cc.contract_id, "contract_cycles.cycle_of_type": 'BuyContract', candidate: cc.contract.candidate)
                            .where('timesheets.end_date <= ? ', cc.end_date.to_date)
      timesheets.each do |ts|
        cc.cyclable.salary_items.build(salaryable: ts).save
      end
      expenses = cc.contract.expenses.where(bill_type: %i[salary_advanced company_expense]).where.not(status: :salaried)
      expenses.each do |expense|
        cc.cyclable.salary_items.build(salaryable: expense).save if eval(expense.salary_ids).include?(cc.id.to_s)
      end
    end
  end

  def show
    cycle_type = @salary.contract_cycle.cycle_frequency
    @buy_contract = @salary.contract_cycle.cycle_of
    @contract_cycles = ContractCycle.where(cycle_type: 'SalaryCalculation').joins(contract: [:buy_contract]).where("contracts.id": current_company.contracts.select(:id)).where(salary_cycle_filter(cycle_type)).where('? between contract_cycles.start_date and contract_cycles.end_date', DateTime.now).where.not("contract_cycles.id": @salary.contract_cycle.id)
  end

  def filter_salary_cycles
    @salary_cycles = ContractCycle.where(contract_id: params[:contract_id], note: 'Salary clear').pluck('date(start_date), date(end_date), contract_id, id')
    # binding.pry
    @timesheets = {}
    @salary_cycles.each_with_index do |x, y|
      @timesheets[y] = Timesheet.includes(contract: :buy_contracts).where(status: 'approved', start_date: x[0]..x[1], contract_id: params[:contract_id])
      @expenses = Expense.where(bill_type: 'salary_advanced', contract_id: current_company.contracts.ids, contract_id: params[:contract_id])
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
    # binding.pry
    params[:sclr_cycle_ids].each do |key, value|
      salary = Salary.find_by(sclr_cycle_id: key)
      next unless salary

      salary.approved_amount = value[:approved_amount].to_i
      salary.pending_amount = value[:pending_amount].to_i
      salary.salary_advance = value[:salary_advance].to_i
      salary.total_amount = value[:approved_amount].to_i + value[:pending_amount].to_i - value[:salary_advance].to_i
      salary.status = 'calculated'
      salary.save
      cc = ContractCycle.find_by(id: salary.sc_cycle_id)
      cc.update(status: 'completed')
    end
    flash[:notice] = 'Salary Calculated'
    render js: "window.location = '#{request.headers['HTTP_REFERER']}'"
  end

  def process_salary
    params[:sclr_cycle_ids].each do |key, value|
      salary = Salary.find_by(sclr_cycle_id: key)
      salary.balance = (salary.total_amount.to_i + CscAccount.where(accountable_id: salary.candidate_id, accountable_type: 'Candidate').sum(:total_amount).to_i) - value[:salary_calculated].to_i
      next_salary = Salary.where(end_date: salary.end_date + 1.month, contract_id: salary.contract_id).first
      next_salary&.update(pending_amount: salary.balance)
      salary.total_amount = value[:salary_calculated].to_i
      salary.status = 'processed'
      salary.save
      cc = ContractCycle.find_by(id: salary.sp_cycle_id)
      cc.update(status: 'completed')
    end
    # params[:comm_ids].each do |key, value|
    #   # binding.pry
    #   csca = CscAccount.find_by(id: key.to_i)
    #   if csca.total_amount.to_i + value[:commission].to_i <= csca.contract_sale_commision.limit.to_i
    #     csca.update(total_amount: value[:commission].to_i + csca.total_amount)
    #   else
    #     csca.update(total_amount: csca.contract_sale_commision.limit.to_i)
    #   end
    # end
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
    params[:sclr_cycle_ids].each do |cycle_id|
      ce_amount = ContractExpense.where(cycle_id: cycle_id).sum(:amount)
      salary = Salary.find_by(sclr_cycle_id: cycle_id)
      commission_amount = CscAccount.where(contract_id: salary.contract_id).sum(:total_amount).to_i
      company_expense = Expense.where(bill_type: 'company_expense').select { |m| m.salary_ids.include? salary.sclr_cycle_id.to_s }.map { |x| x.total_amount.to_i / x.salary_ids.length }.sum(&:to_i)
      # binding.pry
      salary.total_amount = salary.total_amount.to_i - (ce_amount.to_i + commission_amount + company_expense.to_i)
      salary.save
      salary.update(status: 'cleared')
      cc = ContractCycle.find_by(id: salary.sclr_cycle_id)
      cc.update(status: 'completed')
    end
    flash[:notice] = 'Salary cleared'
    render js: "window.location = '#{request.headers['HTTP_REFERER']}'"
  end

  def pay; end

  def add_payment
    respond_to do |format|
      if params[:payment].to_f + @salary.billing_amount <= @salary.total_amount
        if @salary.update(billing_amount: params[:payment].to_f + @salary.billing_amount)
          flash.now[:success] = 'Payment is added to salary'
          format.js {}
        else
          flash.now[:errors] = @salary.errors.full_messages
          format.js {}
        end
      else
        flash.now[:errors] = ['Cannot pay more then total salary amount']
        format.js {}
      end
    end
  end

  def calculate_commission
    # binding.pry
    if params[:comm_ids].present?
      params[:comm_ids].each do |key, _value|
        csca = CscAccount.find_by(id: key.to_i)
        csca.set_commission_calculate_on_seq
      end
    end
    if params[:sclr_cycle_ids].present?
      params[:sclr_cycle_ids].each do |cycle_id|
        salary = Salary.find_by(sclr_cycle_id: cycle_id.to_i)
        salary&.update(status: 'commission_calculated')
        # salary.set_commission_calculate_on_seq
      end
    end
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
    @salaries = Salary.calculated.where(id: params[:ids])
    @salaries.each do |salary|
      book_entry = salary.contract.contract_books.salary.buy_contract.build(bookable: salary, beneficiary: salary.candidate, total: salary.total_amount, paid: salary.billing_amount)
      if book_entry.save
        previous = book_entry.is_first? ? 0.0 : book_entry.previous
        salary.update(status: :processed, previous_balance: previous, total_amount: salary.total_amount + previous)
      end
    end
    redirect_to salaries_path(tab: 'pay')
  end

  def calculate_salary_commission
    Salary.open.where(id: params[:ids]).each do |salary|
      salary.commission_amount = get_commission(salary) unless salary.commission_calculated
      send_commission(salary, salary.contract.buy_contract) unless salary.commission_calculated
      salary.save
    end
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
    @salaries = Salary.processed.where(id: params[:ids])
    @salaries.each do |salary|
      salary.update_attributes(contract_expenses: salary.calculate_expense)
    end
    flash[:success] = 'Contract expenses are calculated'
    redirect_to salaries_path(tab: 'clearing')
  end

  def add_contract_expense_amount
    @salaries = Salary.where(id: params[:ids], status: %i[open pending])
    @salaries.each do |salary|
      advance = salary.calculate_advance
      salary.update_attributes(total_amount: salary.approved_amount.to_f + advance + salary.commission_amount.to_f, salary_advance: advance)
    end
    if @salaries.update_all(status: 'calculated')
      flash[:success] = 'Salary calculated successfully'
      redirect_to salaries_path(tab: 'process')
    else
      flash[:errors] = @salaries.errors.full_messages
      redirect_to salaries_path(tab: 'calculate')
    end
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
    # .where("salaries.status IN (?)", salary_status_index(@tab))
    case tab
    when 'commission'
      [Salary.statuses[:pending], Salary.statuses[:open]]
    when 'calculate'
      [Salary.statuses[:pending], Salary.statuses[:open]]
    when 'process'
      [Salary.statuses[:calculated]]
    when 'pay'
      [Salary.statuses[:processed]]
    when 'clearing'
      [Salary.statuses[:processed]]
    end
  end

  def get_commission(salary)
    amount = 0
    salary.earned_commissions.each do |commission|
      if commission.salaried!
        amount += commission.total_amount
        salary.commission_ids << commission.id
      end
    end
    amount
  end

  def send_commission(salary, buy_contract)
    buy_contract.contract_sale_commisions.each do |commission|
      amount = commission.frequency == 'perhour' ? (salary.approved_amount * commission.rate) / 100.0 : commission.limit
      buy_contract.commission_queues.pending.create(salary: salary, contract_sale_commision: commission, total_amount: amount)
      salary.commission_calculated = true
    end
  end
end
