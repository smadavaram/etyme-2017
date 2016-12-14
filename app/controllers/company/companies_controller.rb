class Company::CompaniesController < Company::BaseController

  respond_to :html,:json

  add_breadcrumb 'Companies', "#", :title => ""

  def edit
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

  #POST company/:id/get_admins_list
  def get_admins_list
    @users = current_company.admins || []
    respond_to do |format|
        format.js
    end
  end

  private

    def company_params
      params.require(:company).permit(:name ,:company_type, :skill_list , :website,:logo,:description,:phone,:email,:linkedin_url,:facebook_url,:twitter_url,:google_url,:is_activated,:status,:time_zone,:tag_line, owner_attributes:[:id, :type ,:first_name, :last_name ,:email,:password, :password_confirmation],locations_attributes:[:id,:name,:status,  address_attributes:[:id,:address_1,:country,:city,:state,:zip_code] ] )
    end # End of company_params

end
