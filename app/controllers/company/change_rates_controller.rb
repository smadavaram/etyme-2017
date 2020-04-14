# frozen_string_literal: true

class Company::ChangeRatesController < Company::BaseController
  before_action :load_contract, only: :create

  def create
    @change_rate = @contract.change_rates.create(change_rate_params)
    if @change_rate.save
      flash[:notice] = 'New Rate is added successfully.'
    else
      flash[:errors] = @change_rate.errors.full_messages
    end
    redirect_to contract_path(@contract.contract)
  end

  def change_rate_params
    params.require(:change_rate).permit(:from_date, :to_date, :rate_type, :rate, :uscis, :working_hrs, overtime_rate)
  end

  private

  def load_contract
    @contract = params[:type].constantize.find_by(id: params[:contract_id])
    redirect_back fallback_location: root_path, error: 'Contract not found.' unless @contract
  end
end
