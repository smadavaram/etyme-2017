class Candidate::AddressesController <  Candidate::BaseController

  respond_to :html,:json

  def update
    current_candidate.update_attributes(address_params)
  end





  private


  def address_params
    params.require(:address).permit(:id,:address_1,:country,:city,:state,:zip_code )
  end
end
