# frozen_string_literal: true

class Company::SellContractsController < Company::BaseController
  add_breadcrumb 'Dashboard', :dashboard_path

  def index
    add_breadcrumb 'sell Contract(s)', company_sell_contracts_path

    @sell_contracts = SellContract.includes(:company, contract: :job).where(contracts: { company_id: current_company.id })
  end

  def show
    add_breadcrumb 'sell Contract(s)', company_sell_contracts_path
    add_breadcrumb params[:id]

    @sell_contract = SellContract.where(number: params[:id]).first
    @contract = @sell_contract.contract
    @signature_documents = @contract.send('sell_contract').document_signs.where(documentable: @contract.company.company_candidate_docs.where(is_require: 'signature').ids)
    @request_documents = @contract.send('sell_contract').document_signs.where(documentable: @contract.company.company_candidate_docs.where(is_require: 'Document').ids)
  end
end
