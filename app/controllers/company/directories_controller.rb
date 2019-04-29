class Company::DirectoriesController < Company::BaseController

  add_breadcrumb "Home", :dashboard_path, :title => "Home"

  def index
    respond_to do |format|
      format.html {}
      format.json {render json: CompanyDirectoryDatatable.new(params, view_context: view_context)}
    end
  end
  
end
