require 'test_helper'

class CompaniesControllerTest < ActionDispatch::IntegrationTest
  # Called before every test method runs. Can be used
  # to set up fixture data.
  def setup
    # We need to stub/mock Recaptcha verification for the test environment if it's not already handled.
    # Assuming ApplicationController or CompaniesController handles Recaptcha,
    # we can stub it for the test.
    # For example, if using a method like `verify_recaptcha(model: @company)`
    # we can stub it on the controller instance or globally.
    # CompaniesController.any_instance.stubs(:verify_recaptcha).returns(true)
    # Or, if it's a method on the model:
    # Company.any_instance.stubs(:recaptcha_valid?).returns(true)

    # For the purpose of this test, we'll assume that `verify_recaptcha`
    # will return true in the test environment or is handled globally.
    # If tests fail due to Recaptcha, this is where it should be addressed.
  end

  test "should set new company owner invitation_limit to nil upon company creation" do
    # Prepare attributes for the company and its owner
    # Ensure email is unique to avoid conflicts with existing records or other tests
    unique_email = "testowner_#{Time.now.to_i}_#{rand(1000)}@example.com"
    
    company_attributes = {
      name: "TestCorp Inc.",
      company_type: "vendor", # Assuming 'vendor' is a valid company_type
      website: "testcorp.example.com", # Assuming website is derived or can be set
      # Add any other mandatory fields for Company model that are not auto-generated
      owner_attributes: {
        first_name: "Test",
        last_name: "Owner",
        email: unique_email,
        password: "password123",
        password_confirmation: "password123",
        type: 'Admin' # Ensure type is correctly passed if needed by `build_owner` or params
      }
    }

    # Assert that a new Company and a new User (owner) are created
    assert_difference 'Company.count', 1 do
      assert_difference 'User.count', 1 do # Assuming owner is created as a User
        post companies_url, params: { company: company_attributes }
      end
    end

    # Assert that the response is successful.
    # The controller renders 'companies/signup_success', which implies a 200 OK response.
    # If it were a redirect, it would be :redirect or a specific redirect status.
    assert_response :ok # Check if 'companies/signup_success' renders with 200

    # Fetch the newly created company and its owner
    # It's safer to fetch by a unique attribute like the email used.
    new_company_owner = User.find_by(email: unique_email)
    
    assert_not_nil new_company_owner, "New company owner (User) should be found."
    assert_not_nil new_company_owner.company, "Owner should be associated with a company."
    assert_equal "TestCorp Inc.", new_company_owner.company.name, "Company name should match."

    # Assert that the owner's invitation_limit is nil
    assert_nil new_company_owner.invitation_limit, "Newly created company owner's invitation_limit should be nil."
  end
end
