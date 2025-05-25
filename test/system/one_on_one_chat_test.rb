require "application_system_test_case"

class OneOnOneChatTest < ApplicationSystemTestCase
  setup do
    # It's good practice to ensure a clean state, e.g., clear jobs queue
    # ActionCable.server.restart if ActionCable.server.present? # If needed and available

    # Create a company (assuming users are associated with a company)
    # Adjust attributes as per your Company model's requirements
    @company = Company.create!(
      name: "Test Chat Company",
      company_type: "vendor", # Or any valid type
      website: "chatcompany.example.com"
      # Add other mandatory company fields if any
    )

    # Create two users associated with the company
    @user_one = User.create!(
      email: "chatuser1@example.com",
      password: "password123",
      password_confirmation: "password123",
      first_name: "ChatUser",
      last_name: "One",
      confirmed_at: Time.now,
      company_id: @company.id, # Associate with the company
      type: 'Admin' # Or 'User' or whatever type is appropriate for login
    )
    @user_two = User.create!(
      email: "chatuser2@example.com",
      password: "password123",
      password_confirmation: "password123",
      first_name: "ChatUser",
      last_name: "Two",
      confirmed_at: Time.now,
      company_id: @company.id, # Associate with the company
      type: 'Admin' # Or 'User'
    )

    # Create a 1-on-1 conversation between them
    # Assuming Conversation model has senderable and recipientable polymorphic associations
    # and topic can distinguish the type of chat.
    @conversation = Conversation.create!(
      senderable: @user_one,
      recipientable: @user_two,
      topic: :OneToOne # As per instructions
    )

    # If conversations are tied to a Group, the setup might be:
    # @group = Group.create!(company: @company, group_name: "Chat between One and Two", is_private: true) # Example
    # @group.group_members.create!(memberable: @user_one)
    # @group.group_members.create!(memberable: @user_two)
    # @conversation = @group.conversation || @group.create_conversation # Depending on callbacks
    # For this test, directly creating Conversation as instructed.
  end

  test "1-on-1 chat messages are delivered in real-time" do
    # --- User One's Session ---
    login_as(@user_one, scope: :user) # Assumes Devise's login_as helper

    # Navigate to the conversation page.
    # The path helper might vary based on your routes.rb (e.g., conversation_path, group_conversation_path)
    # Let's assume a generic path for now, this often needs to be specific.
    # A common pattern is conversation_messages_path(@conversation) or similar
    visit conversation_messages_path(@conversation) # Placeholder, adjust if needed

    # Fill in the message input field and submit
    # The ID/name "conversation_message_body" is an assumption. Inspect your form to get the correct selector.
    # The send button text "Send" is also an assumption.
    fill_in "conversation_message[body]", with: "Hello from User One" # Check field name/id
    click_button "Send" # Check button text/id

    # Assert User One sees their own message
    assert_text "Hello from User One", wait: 5 # Wait for potential async display

    # --- User Two's Session ---
    # Use Capybara.using_session to simulate a different user in a different browser context
    Capybara.using_session(:user_two_session) do
      login_as(@user_two, scope: :user)

      visit conversation_messages_path(@conversation) # Navigate to the same conversation

      # Assert User Two sees User One's message delivered by Action Cable
      # The `wait` option is crucial for real-time updates.
      assert_text "Hello from User One", wait: 10 # Increased wait time for CI/slower environments

      # Optional: User Two sends a reply
      fill_in "conversation_message[body]", with: "Hi User One! Got your message."
      click_button "Send"
      assert_text "Hi User One! Got your message.", wait: 5
    end

    # --- Back to User One's Session (Optional Check for User Two's Reply) ---
    # Session context automatically reverts to the original session after the `using_session` block.
    # Assert User One sees User Two's reply
    assert_text "Hi User One! Got your message.", wait: 10
  end
end
