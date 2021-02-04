# frozen_string_literal: true

class Company::DirectoriesController < Company::BaseController
  add_breadcrumb 'Dashboard', :dashboard_path

  def index
    add_breadcrumb 'My Directory'

    respond_to do |format|
      # format.html { render plain: 'An error occured...' }
      format.json { render json: CompanyDirectoryDatatable.new(params, view_context: view_context) }
    end
  end
end
