# frozen_string_literal: true

class Company::BuyContractsController < Company::BaseController

  add_breadcrumb 'Dashboard', :dashboard_path

  def index
    add_breadcrumb 'buy Contract(s)', company_buy_contracts_path

    @buy_contracts = BuyContract.includes(:company, contract: :job).where(contracts: { company_id: current_company.id })
    # @buy_contracts = BuyContract.where(candidate_id: current_company.id)
  end

  def show
    add_breadcrumb 'buy Contract(s)', company_buy_contracts_path
    add_breadcrumb params[:id]

    @buy_contract = BuyContract.where(number: params[:id]).first
    @contract = @buy_contract.contract
    @candidate_signature_documents = @contract.send('buy_contract').document_signs.where(signable: @contract.buy_contract.contract.candidate, documentable: current_company.company_candidate_docs.where(is_require: 'signature').ids)
    @vendor_signature_documents = @contract.buy_contract.company.present? ? @contract.send('buy_contract').document_signs.where(signable: @contract.buy_contract.company.owner, documentable: current_company.company_candidate_docs.where(is_require: 'signature').ids) : []
    @candidate_request_documents = @contract.send('buy_contract').document_signs.where(signable: @contract.buy_contract.contract.candidate, documentable: current_company.company_candidate_docs.where(is_require: 'Document').ids)

  end
end
