class Company::SalariesController < Company::BaseController

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
    con = current_company.contracts.includes(:candidate).where('contracts.status= ?', 6)
    @salaries = ContractCycle.includes(:candidate).where(note: 'Salary clear', contract_id: current_company.contracts.ids).pluck("date(contract_cycles.start_date), date(contract_cycles.end_date), contract_cycles.contract_id, contract_cycles.id").group_by{|e| [e[0], e[1]]}.map { |c, xs| [c, xs.map{|x| [x[2], x[3]]}] }
    # binding.pry
    @contracts = current_company.in_progress_contracts
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

  private

  def salary_params
    params.require(:salary).permit(:balance, :total_amount, :billing_amount, :id)
  end

end
