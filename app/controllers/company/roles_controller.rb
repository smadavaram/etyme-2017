class Company::RolesController < Company::BaseController
  add_breadcrumb "ROLES", :roles_path, options: { title: "ROLES" }

  before_action :set_new_role , only: [:index]
  before_action :set_role , only: [:destroy]


  def new

  end

  def edit

  end

  def index
    @roles = current_company.roles.includes(:permissions) || []
  end

  def create
    @role = current_company.roles.new(role_params)
    if @role.save
      flash[:success] = "New Role has been successfully created"
      redirect_to roles_path
    else
      flash[:errors] = @role.errors.full_messages
      redirect_to roles_path
    end
  end

  private

  def set_new_role
    @role = current_company.roles.new
  end

  def set_role
    @role = current_company.roles.find_by_id(params[:id]) || []
  end

  def role_params
    params.require(:role).permit(:name,
                                 permissions_attributes:[:id, :name, :_destroy],permission_ids: [])
  end
end
