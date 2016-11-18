class Company::CompaniesController < Company::BaseController
  respond_to :html,:json
  #BreadCrumbs


  def edit
    add_breadcrumb current_company.name.titleize, "#", :title => ""
    @company_doc = current_company.company_docs.new
    @company_doc.build_attachment
    @location = current_company.locations.build
    @location.build_address
    render layout: 'company'
  end
  def update
    current_company.update_attributes(company_params)
    flash[:success]="Company Updated Successfully"
    respond_with current_company
  end

  private

  def company_params
    params.require(:company).permit(:name ,:company_type_id, :website,:logo,:description,:phone,:email,:linkedin_url,:facebook_url,:twitter_url,:google_url,:is_activated,:status,:time_zone,:tag_line, owner_attributes:[:id, :type ,:first_name, :last_name ,:email,:password, :password_confirmation],locations_attributes:[:id,:name,:status,  address_attributes:[:id,:address_1,:country,:city,:state,:zip_code] ] )
  end # End of company_params

end
