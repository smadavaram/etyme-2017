class Company::AdminsController < Company::BaseController

  add_breadcrumb "Admins", :admins_path, options: { title: "Admins" }
  before_action :authorized_user ,only:  [:new ,:index]
  before_action :find_admin ,only: [:edit,:update,:destroy]

  #CallBacks
  before_action :set_new_admin , only: [:new]
  before_action :set_roles , only: [:new , :index]
  before_action :set_locations , only: [:new , :index]

  def index
    @search      = current_company.admins.search(params[:q])
    @admins = @search.result.order(created_at: :desc).includes(:roles).paginate(page: params[:page], per_page: 30) || []
  end

  def new
    add_breadcrumb "NEW", :new_admin_path
    respond_to do |format|
      format.js
      format.html
    end
  end

  def create
    @admin = current_company.admins.new(admin_params)
    if @admin.save
      flash[:success] =  "Successfull Added."
    else
      flash.now[:errors] = @admin.errors.full_messages
    end
    redirect_back fallback_location: root_path

  end

  def edit
  end

  def update
    admin_name = @admin.full_name
    if @admin.update(admin_params)
      flash[:success] = "#{admin_name} updated successfully."
    else
      flash[:errors] = @admin.errors.full_messages
    end
    redirect_back fallback_location: root_path
  end
  def destroy
    name = @admin.full_name
    if @admin.destroy
      flash[:success] = "#{name} deleted successfully."
    else
      flash[:errors] = @admin.errors.full_messages
    end
    redirect_back fallback_location: root_path
  end

  def authorized_user
    has_access?("manage_company")
  end



  private
  def find_admin
    @admin = current_company.admins.find(params[:id])
  end

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
                                  :primary_address_id,
                                       role_ids: [],
                                       company_doc_ids: [],

    )
  end
end
