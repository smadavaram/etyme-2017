class Company::AdminsController < Company::BaseController

  add_breadcrumb "Admins", :admins_path, options: { title: "Admins" }

  #CallBacks
  before_action :set_new_admin , only: [:new]
  before_action :set_roles , only: [:new]
  before_action :set_locations , only: [:new]

  def new
    add_breadcrumb "NEW", :new_admin_path
  end

  def create
    @admin = current_company.admins.new(admin_params)
    if @admin.valid?
      @admin.save
      flash[:success] =  "Successfull Added."
      redirect_to new_admin_path
    else
      flash.now[:errors] = @admin.errors.full_messages
      return render 'new'
    end
  end

  private

  def set_new_admin
    @admin = current_company.admins.new
  end

  def set_roles
    @roles = current_company.roles || []
  end

  def set_locations
    @locations = current_company.locations || []
  end
  def admin_params
    params.require(:admin).permit(:first_name,
                                       :last_name ,
                                       :email ,
                                       role_ids: [],
                                       company_doc_ids: []
    )
  end # End of company_params
end
