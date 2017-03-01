class Company::DirectoriesController < Company::BaseController

  add_breadcrumb "Home", :dashboard_path, :title => "Home"

  def index
    add_breadcrumb "Directories", :directories_path, :title => "Directories"
  end
  
end
