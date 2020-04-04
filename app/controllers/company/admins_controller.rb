class Company::AdminsController < Company::BaseController

  autocomplete :user, :email,:full => true
  add_breadcrumb "Dashboard", :dashboard_path
  before_action :authorized_user, only: [:new, :index]
  before_action :find_admin, only: [:edit, :update, :destroy]

  #CallBacks
  before_action :set_new_admin, only: [:new]
  before_action :set_roles, only: [:new, :index]
  before_action :set_locations, only: [:new, :index]


  def get_autocomplete_items(parameters)
    active_record_get_autocomplete_items(parameters).where(company_id: current_company.id)
  end

  def index
    add_breadcrumb "Admins", admins_path, options: {title: "Admins"}
    @search = current_company.admins.search(params[:q])
    @admins = @search.result.order(created_at: :desc).includes(:roles).paginate(page: params[:page], per_page: 30) || []
  end

  def add_member
    @user = current_company.users.find_by_id(params[:admin_id])
  end

  def add_as_child
    @user = current_company.users.find_by_id(params[:admin_id])
    @member = current_company.users.find_by_id(params[:id])
    if @member
      unless @member.parent_id.present?
        if @member.update(parent_id: @user.id)
          flash.now[:success] = 'Team Member Added Successfuly'
        else
          flash.now[:errors] = @member.errors.full_messages
        end
      else
        flash.now[:errors] = ["Already belongs to a team"]
      end
    else
      flash.now[:errors] = ["User does not belongs to current company"]
    end
  end

  def new
    add_breadcrumb "NEW", new_admin_path
    respond_to do |format|
      format.js
      format.html
    end
  end

  def create
    @admin = current_company.admins.new(admin_params)
    respond_to do |format|
      if @admin.save
        format.html {redirect_to redirect_back fallback_location: root_path, success: 'Successfull Added.'}
        format.js {flash.now[:success] = "successfully Created."}
      else
        format.html {flash[:errors] = @admin.errors.full_messages; render :new}
        format.js {flash.now[:errors] = @admin.errors.full_messages}
      end
    end


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
                                  :last_name,
                                  :email, :phone,
                                  :primary_address_id,
                                  role_ids: [],
                                  company_doc_ids: [],

    )
  end
end
