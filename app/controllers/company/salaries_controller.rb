class Company::SalariesController < Company::BaseController

  def salary_list
      filter_salary_cycles
  end

  def filter_salary_cycles
    @salary_cycles = ContractCycle.where(contract_id: params[:contract_id], note: 'Salary clear').pluck("date(start_date), date(end_date), contract_id, id")
    # binding.pry
    @timesheets = Hash.new
    @salary_cycles.each_with_index do |x,y|
         
      @timesheets[y] = Timesheet.includes(contract: :buy_contracts).where(status: 'approved', start_date: x[0]..x[1])
    @expenses = Expense.where(bill_type: 'salary_advanced', contract_id: current_company.contracts.ids, contract_id: params[:contract_id])
    end
  end

  def salary_process
    @salaries = ContractCycle.where(note: 'Salary clear').pluck("date(start_date), date(end_date), contract_id, id")
  end

end
