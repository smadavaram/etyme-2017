class Company::AdminsController < Company::BaseController

  add_breadcrumb "Admins", :admins_path, options: { title: "Admins" }
  before_action :authorized_user ,only:  [:new ,:index]

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
    if @admin.valid?
      @admin.save
      flash[:success] =  "Successfull Added."
      redirect_to admins_path
    else
      flash.now[:errors] = @admin.errors.full_messages
      return render 'new'
    end
  end

  def authorized_user
    has_access?("manage_company")
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
  end
end
