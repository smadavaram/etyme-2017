class ChargesController < ApplicationController
	layout 'company'

	def new
	end

	def create
	  # Amount in cents
	  @amount = 999

	  customer = Stripe::Customer.create({
	    email: params[:stripeEmail],
	    source: params[:stripeToken],
	  })

	  charge = Stripe::Charge.create({
	    customer: customer.id,
	    amount: @amount,
	    description: 'Rails Stripe customer',
	    currency: 'usd',
	  })

	  #self.stripe_charge_id = charge.id

	rescue Stripe::CardError => e
	  flash[:error] = e.message
	  redirect_to new_charge_path
	end

	def add_coupon
		
	end

end
