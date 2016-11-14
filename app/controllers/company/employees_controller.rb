class Company::EmployeesController < Company::BaseController

  add_breadcrumb "EMPLOYEES", :employees_path, :options => { :title => "EMPLOYEES" }

  #CallBacks
  before_action :set_new_employee , only: [:new]
  def new
    add_breadcrumb "NEW", :new_employee_path

    @roles = Role.all || []

  end

  def create

    @employee = current_company.employees.new(employee_params)
    if @employee.valid?
      @employee.save
      flash[:success] =  "Successfull Added."
      redirect_to dashboard_path
    else
      puts '%'*100
      puts @employee.errors.full_messages
      puts '%'*100
      flash.now[:errors] = @employee.errors.full_messages
      return render 'new'
    end


  end

  private

  def set_new_employee
    @employee = current_company.employees.new
    @employee.build_employee_profile
  end

  def employee_params
    params.require(:employee).permit(:first_name, :last_name ,:email ,role_ids: [], employee_profile_attributes:[:id, :location_id ,:designation, :joining_date ,:employment_type,:salary_type, :salary])
  end # End of company_params
end
