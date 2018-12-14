class Company::SalariesController < Company::BaseController
  require 'sequence'
  def salary_list
      filter_salary_cycles
  end

  def filter_salary_cycles
    @salary_cycles = ContractCycle.where(contract_id: params[:contract_id], note: 'Salary clear').pluck("date(start_date), date(end_date), contract_id, id")
    # binding.pry
    @timesheets = Hash.new
    @salary_cycles.each_with_index do |x,y|
         
      @timesheets[y] = Timesheet.includes(contract: :buy_contracts).where(status: 'approved', start_date: x[0]..x[1], contract_id: params[:contract_id])
    @expenses = Expense.where(bill_type: 'salary_advanced', contract_id: current_company.contracts.ids, contract_id: params[:contract_id])
    end
  end

  def salary_process
    @ledger = Sequence::Client.new(
        ledger_name: 'company-dev',
        credential: 'OUUY4ZFYQO4P3YNC5JC3GMY7ZQJCSNTH'
    )
    @monthly_salaries = ContractCycle.includes(:candidate, contract: [:buy_contracts]).where(note: 'Salary clear', contract_id: current_company.contracts.ids).where('buy_contracts.salary_clear =?', 'monthly').order(start_date: :asc).pluck("date(contract_cycles.start_date), date(contract_cycles.end_date), contract_cycles.contract_id, contract_cycles.id").group_by{|e| [e[0], e[1]]}.map { |c, xs| [c, xs.map{|x| [x[2], x[3]]}] }

    @weekly_salaries = ContractCycle.includes(:candidate, contract: [:buy_contracts]).where(note: 'Salary clear', contract_id: current_company.contracts.ids).where('buy_contracts.salary_clear =?', 'weekly').order(start_date: :asc).pluck("date(contract_cycles.start_date), date(contract_cycles.end_date), contract_cycles.contract_id, contract_cycles.id").group_by{|e| [e[0], e[1]]}.map { |c, xs| [c, xs.map{|x| [x[2], x[3]]}] }
    @contracts = current_company.in_progress_contracts.includes(:buy_contracts, candidate: [:addresses])
    @timesheets = Timesheet.includes(contract: :buy_contracts)
    @expenses = Expense.where(contract_id: current_company.in_progress_contracts.ids )
    @contract_expense_types = ContractExpenseType.all
    @months = Date::ABBR_MONTHNAMES.dup.slice(1,12)

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
    redirect_to salary_process_salaries_path
  end

  def calculate_salary
    params[:sc_cycle_ids].each do |key,value|
      salary = Salary.find_by(sc_cycle_id: key)
      salary.approved_amount = value[:approved_amount].to_i
      salary.pending_amount = value[:pending_amount].to_i
      salary.salary_advance = value[:salary_advance].to_i
      salary.total_amount = value[:approved_amount].to_i + value[:pending_amount].to_i - value[:salary_advance].to_i
      salary.status = 'calculated'
      salary.save
    end
    flash[:notice] = 'Salary Calculated'
    render :js => "window.location = '#{salary_process_salaries_path}'"
  end

  def process_salary
    params[:sc_cycle_ids].each do |key,value|
      salary = Salary.find_by(sc_cycle_id: key)
      salary.balance = salary.total_amount  - value[:salary_calculated].to_i 
      Salary.where(end_date: salary.end_date+1.month, contract_id: salary.contract_id).first.update(pending_amount: salary.balance)
      salary.total_amount = value[:salary_calculated].to_i
      salary.status = 'processed'
      salary.save
    end
    # flash[:notice] = 'Salary Processed'
    # render :js => "window.location = '#{salary_process_salaries_path}'"
  end

  def aggregate_salary
    csv = Salary.generate_csv(params[:sc_cycle_ids])
    respond_to do |format|
      format.csv {send_data csv, file_name: 'aggregate_salary.csv' }
    end
    NotificationMailer.send_csv(csv).deliver if params[:send_mail] == 'true'
  end

  def clear_salary
    params[:sc_cycle_ids].each do |cycle_id|
      ce_amount =  ContractExpense.where(cycle_id: cycle_id).sum(:amount)
      salary = Salary.find_by(sc_cycle_id: cycle_id)
    end
  end

  def check_salary_status
    salary = Salary.find_by(sc_cycle_id: params[:sc_cycle_id])
    respond_to do |format|
      format.html
      format.json { render json: salary }
    end
  end

  def add_contract_expense_type
    ContractExpenseType.create(contract_expense_type_params)
    redirect_to salary_process_salaries_path(sc_cycle_id: params[:sc_cycle_id])
  end

  def delete_contract_expense_type
    ContractExpenseType.find_by(id: params[:id]).destroy
    redirect_to salary_process_salaries_path(sc_cycle_id: params[:sc_cycle_id])

  end

  def add_contract_expense_amount
    salary = Salary.find_by(sc_cycle_id: params[:sc_cycle_id])
    ce = ContractExpense.find_by(contract_id: salary.contract_id, candidate_id: salary.candidate_id, cycle_id: params[:sc_cycle_id], con_ex_type: params[:cet_id])
    unless ce
      ce = ContractExpense.create(contract_id: salary.contract_id, candidate_id: salary.candidate_id, amount: params[:amount], cycle_id: params[:sc_cycle_id], con_ex_type: params[:cet_id])
    else
      ce.update(amount: params[:amount])
    end
    flash[:notice] = 'Expense saved.'
    render json: flash
  end

  private

  def salary_params
    params.require(:salary).permit(:balance, :total_amount, :billing_amount, :id)
  end

  def contract_expense_type_params
    params.require(:contract_expense_type).permit(:name)
  end

end
