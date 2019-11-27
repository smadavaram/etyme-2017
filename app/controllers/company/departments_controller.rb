class Company::DepartmentsController < Company::BaseController
  before_action :set_department , only: [:create]
  before_action :find_department,only:[:edit,:update, :destroy]
  respond_to :html,:json
  add_breadcrumb "Dashboard", :dashboard_path


  def index
    add_breadcrumb "Department(s)"
    @department = current_company.company_departments
  end
  def create
    @department = current_company.company_departments.create!(dept_params)
    redirect_back fallback_location: root_path
  end

  def new
    @department = current_company.company_departments.new
    @department.build_department
  end

  def update
    @department.update_attributes(dept_params)
    redirect_back fallback_location: root_path
  end

  def destroy
    @department.destroy
    redirect_back fallback_location: root_path
  end

  private

  def find_department
    @department=current_company.company_departments.find(params[:id])
  end
  def set_department
    @location=current_company.company_departments.new(dept_params)
  end

  def dept_params
    params.require(:company_department).permit(:id, department_attributes:[:id,:name] )
  end

end