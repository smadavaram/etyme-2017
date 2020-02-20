# frozen_string_literal: true

class Company::BuyContractsController < Company::BaseController
  def index
    @buy_contracts = BuyContract.where(candidate_id: current_company.id)
  end

  def show
    @buy_contract = BuyContract.where(number: params[:id]).first
  end
end
