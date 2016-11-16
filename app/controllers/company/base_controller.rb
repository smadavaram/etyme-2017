class Company::BaseController < ApplicationController
  before_filter :authenticate_user!
  layout 'company'

end