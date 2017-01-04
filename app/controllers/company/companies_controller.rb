class Company::CompaniesController < Company::BaseController

  before_action :find_admin, only: :change_owner

  respond_to :html,:json

  add_breadcrumb 'Companies', "#", :title => ""

  def edit
  end


  def create
    @company = Company.new(create_params)
    respond_to do |format|
      if @company.save
        format.html {flash[:success] = "successfully Send."}
        format.js{ flash.now[:success] = "successfully Send." }
      else
        format.js{ flash.now[:errors] =  @company.errors.full_messages }
        format.html{ flash[:errors] =  @company.errors.full_messages }
      end
    end
    redirect_to :back
  end

  def update
    current_company.update_attributes(company_params)
    flash[:success]="Company Updated Successfully"
    respond_with current_company
  end

  def show
    add_breadcrumb current_company.name.titleize, company_path, :title => ""
    @company_doc = current_company.company_docs.new
    @company_doc.build_attachment
    @location = current_company.locations.build
    @location.build_address

    #pagination
    # @company_docs = current_company.company_docs.paginate(:page => params[:page], :per_page => 15)
  end
  def update_logo
    render json: current_company.update_attribute(:logo, params[:photo])
    flash.now[:success] = "Logo Successfully Updated"
  end

  def get_admins_list
    @users = Company.find_by_id(params[:id]).admins || []
    respond_to do |format|
        format.js
    end
  end

  def change_owner
    if current_company.update_column(:owner_id , @admin.id)
      flash[:success]="Owner Changed"
    end
  end

  private

  def find_admin
    @admin=current_company.admins.find_by_id(params[:admin_id])
  end

    def company_params
      params.require(:company).permit(:name ,:company_type, :skill_list , :website,:logo,:description,:phone,:email,:linkedin_url,:facebook_url,:twitter_url,:google_url,:is_activated,:status,:time_zone,:tag_line, owner_attributes:[:id, :type ,:first_name, :last_name ,:email,:password, :password_confirmation],locations_attributes:[:id,:name,:status,  address_attributes:[:id,:address_1,:country,:city,:state,:zip_code] ] )
    end

    def create_params
      params.require(:company).permit([:name ,owner_attributes:[:id, :type  , :first_name, :last_name ,:email] , invited_by_attributes: [:invited_by_company_id , :user_id]])
    end
end
