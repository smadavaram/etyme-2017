class Company::AccountingsController < Company::BaseController

  def recieved_payment

  end

  def bill_pay

  end


  def salary_to_pay
    @salaries = Salary.open_salaries.where(contract_id: current_company.contracts.ids)
  end

  def generate_salary_cycles
    Contract.first.in_progress!
    Contract.set_cycle
    redirect_to salary_advance_company_accountings_path
  end

  def check_salary
    @salary = Salary.where(id: params[:id] ).first
    if @salary.present?
      @timesheets = current_company.timesheets.includes(contract: :buy_contracts).approved_timesheets.where(contract_id: @salary.contract_id).where("start_date >= ? AND end_date <= ?", @salary.start_date, @salary.end_date).order(id: :asc)
    else
      @errors = true
    end
  end
end