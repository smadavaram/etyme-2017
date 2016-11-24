class Company::CompaniesController < Company::BaseController
  respond_to :html,:json
  #BreadCrumbs

  before_action :find_company , only: [:get_consultant_list]


  def edit
    add_breadcrumb current_company.name.titleize, "#", :title => ""
    @company_doc = current_company.company_docs.new
    @company_doc.build_attachment
    @location = current_company.locations.build
    @location.build_address
  end
  def update
    current_company.update_attributes(company_params)
    flash[:success]="Company Updated Successfully"
    respond_with current_company
  end

  def get_consultant_list
    @users = @company.users || []
    respond_to do |format|
        format.js
    end
  end

  private

  def find_company
    @company = Company.find_by_id(params[:id]) || []
  end

  def company_params
    params.require(:company).permit(:name ,:company_type_id, :website,:logo,:description,:phone,:email,:linkedin_url,:facebook_url,:twitter_url,:google_url,:is_activated,:status,:time_zone,:tag_line, owner_attributes:[:id, :type ,:first_name, :last_name ,:email,:password, :password_confirmation],locations_attributes:[:id,:name,:status,  address_attributes:[:id,:address_1,:country,:city,:state,:zip_code] ] )
  end # End of company_params

end
