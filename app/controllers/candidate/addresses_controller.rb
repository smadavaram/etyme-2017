# frozen_string_literal: true

class Candidate::AddressesController < Candidate::BaseController
  respond_to :html, :json
  #
  # def update
  #   current_candidate.address.update_attributes(address_params)
  #   respond_with current_candidate.address
  #
  # end

  private

  def address_params
    params.require(:address).permit(:address_1, :country, :city, :state, :zip_code)
  end
end
