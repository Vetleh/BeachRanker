import { fireEvent, render } from "@testing-library/react-native";
import { Segmented } from "../Segmented";

describe("Segmented", () => {
  it("reports the option the user selects", async () => {
    const onChange = jest.fn();
    const { getByText } = await render(
      <Segmented
        value="MEN"
        options={[
          { label: "Men", value: "MEN" },
          { label: "Women", value: "WOMEN" },
        ]}
        onChange={onChange}
      />,
    );

    fireEvent.press(getByText("Women"));

    expect(onChange).toHaveBeenCalledWith("WOMEN");
  });
});
