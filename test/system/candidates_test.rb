require "application_system_test_case"

class CandidatesTest < ApplicationSystemTestCase
  setup do
    candidate = Candidate.new(
      first_name: 'Cassian',
      last_name: 'Andor',
      email: 'cassian@andor.com',
      password: 'cassianandor',
      password_confirmation: 'cassianandor'
    )
    candidate.save
    candidate.confirm
  end

  test "logging in a candidate" do
    visit root_url
    assert_selector "button", text: "Login"
    assert_no_selector "a", text: "Candidate"
    click_on "Login"
    assert_selector "a", text: "Candidate"
    click_on "Candidate"
    sleep 0.5
    assert_selector "h4", text: "Sign In"
    fill_in "candidate_email", with: "cassian@andor.com"
    fill_in "candidate_password", with: 'cassianandor'
    find('input[type="submit"]').click
    assert_no_selector "button", text: "Login"
  end
end
