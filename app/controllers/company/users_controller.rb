class Company::UsersController < Company::BaseController

  # Dashboard after Employer/Vendor login
  # add_breadcrumb :root_name, "/"

  def dashboard
    add_breadcrumb "HOME", :dashboard_path
  end # End of dashboard

end