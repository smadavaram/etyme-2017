require "application_system_test_case"

class CandidatesTest < ApplicationSystemTestCase
  setup do
    puts 'TOP OF SETUP BLOCK'
    candidate = Candidate.new(
      first_name: 'Cassian',
      last_name: 'Andor',
      email: 'cassian@andor.com',
      password: 'cassianandor',
      password_confirmation: 'cassianandor'
    )
    candidate.save
    candidate.confirm
    puts "CANDIDATE SAVED: #{candidate.inspect}"
  end

  test "logging in a candidate" do
    puts 'TOP OF TEST BLOCK'
    puts page.driver.browser
    visit root_url
    puts 'AFTER VISIT ROOT_URL'
    puts current_url
    assert_selector "button", text: "Login"
    puts 'AFTER ASSERT SELECTOR BUTTON'
    assert_no_selector "a", text: "Candidate"
    puts 'AFTER ASSERT NO SELECTOR A'
    click_on "Login"
    puts 'AFTER CLICK ON LOGIN'
    assert_selector "a", text: "Candidate"
    puts 'AFTER ASSERT SELECTOR A'
    click_on "Candidate"
    puts 'AFTER CLICK ON CANDIDATE'
    sleep 0.5
    puts 'AFTER SLEEP'
    assert_selector "h4", text: "Sign In"
    puts 'AFTER ASSERT SELECTOR H4'
    fill_in "candidate_email", with: "cassian@andor.com"
    puts 'AFTER FILL IN EMAIL'
    fill_in "candidate_password", with: 'cassianandor'
    puts 'AFTER FILL IN PASSWORD'
    find('input[type="submit"]').click
    puts 'AFTER FIND INPUT TYPE SUBMIT CLICK'
    assert_no_selector "button", text: "Login"
    puts 'AFTER ASSERT NO SELECTOR BUTTON'
  end
end
