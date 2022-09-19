# frozen_string_literal: true

class Company::CompanyForwardDomainsController < Company::BaseController
  before_action :find_company, only: %i[index]
  add_breadcrumb 'Dashboard', :dashboard_path
  def index
    add_breadcrumb 'Forward'
    # @company_legal_docs = CompanyLegalDoc.new
  end

  private

  def company_forward_domains_params
    # params.require(:company_legal_docs).permit(:id, :name, :file, :title, :custome_name, :company_id)
  end

  def find_company
    @company = Company.find(params[:id] || params[:company_id])
  end
end
